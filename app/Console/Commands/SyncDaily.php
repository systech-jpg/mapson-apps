<?php

namespace App\Console\Commands;

use App\Models\AccurateSetting;
use App\Models\HadirrSetting;
use App\Services\Accurate\AccurateSyncService;
use App\Services\Erp\ErpStockSyncService;
use App\Services\Erp\SalesSyncService;
use App\Services\Hadirr\HadirrSyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Daily consolidated sync of all staging data.
 * - Snapshot data (stock) → truncate + insert today's snapshot.
 * - Transactional data (sales/SO/DO/movements/attendance) → idempotent upsert of a rolling
 *   window (default 7 days) so edited/backdated documents are re-captured.
 * Each source is isolated: a failure is logged and the rest still run.
 */
class SyncDaily extends Command
{
    protected $signature = 'sync:daily {--days=7 : Rolling window (hari) untuk data transaksi}';

    protected $description = 'Sinkronisasi harian: ERP (sales_facts + stok), Accurate (sales/stok/movements), Hadirr (karyawan + absensi).';

    public function handle(SalesSyncService $erpSales, ErpStockSyncService $erpStock, AccurateSyncService $acc, HadirrSyncService $hadirr): int
    {
        $days = max(1, (int) $this->option('days'));
        $today = now();
        $from = $today->copy()->subDays($days);

        $this->info("Mulai sync:daily (window {$days} hari, {$from->toDateString()} → {$today->toDateString()})");

        // --- ERP (Dolibarr) ---
        $this->step('ERP sales_facts', fn () => $erpSales->sync());
        $this->step('ERP stock snapshot', fn () => $erpStock->sync());

        // --- Accurate ---
        if (AccurateSetting::current()->isConnected()) {
            $af = $from->format('d/m/Y');
            $at = $today->format('d/m/Y');
            $this->step('Accurate sales (faktur+SO+DO)', fn () => $acc->syncSales($af, $at));
            $this->step('Accurate stock snapshot', fn () => $acc->syncItemStock(null, true));
            $this->step('Accurate stock movements', fn () => $acc->syncStockMovements($af, $at));
        } else {
            $this->warn('Accurate: belum terhubung — dilewati.');
        }

        // --- Hadirr ---
        if (HadirrSetting::current()->is_active) {
            $hf = $from->format('Y-m-d');
            $ht = $today->format('Y-m-d');
            $this->step('Hadirr employees', fn () => $hadirr->syncEmployees());
            $this->step('Hadirr attendance', fn () => $hadirr->syncAttendances($hf, $ht));
        } else {
            $this->warn('Hadirr: tidak aktif — dilewati.');
        }

        $this->info('Selesai sync:daily.');

        return self::SUCCESS;
    }

    /** Run one source in isolation; log success/failure without aborting the rest. */
    private function step(string $label, \Closure $fn): void
    {
        $start = microtime(true);
        try {
            $result = $fn();
            $ms = (int) round((microtime(true) - $start) * 1000);
            $summary = is_array($result) ? json_encode($result) : (string) $result;
            $this->info("  ✓ {$label} ({$ms} ms) {$summary}");
            Log::info("sync:daily · {$label} OK", ['ms' => $ms, 'result' => $result]);
        } catch (\Throwable $e) {
            $this->error("  ✗ {$label}: {$e->getMessage()}");
            Log::error("sync:daily · {$label} GAGAL", ['error' => $e->getMessage()]);
        }
    }
}
