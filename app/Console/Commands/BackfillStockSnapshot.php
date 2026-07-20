<?php

namespace App\Console\Commands;

use App\Models\SyncLog;
use App\Services\Erp\ErpStockSyncService;
use App\Support\InventorySnapshot;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Isi ulang riwayat snapshot stok ERP ke belakang.
 *
 * Bisa dilakukan karena ErpStockSyncService::sync($asOf) menghitung saldo genuinely
 * as-of tanggal dari stock_mouvement Dolibarr — bukan sekadar menyalin saldo kini.
 * Sisi Accurate TIDAK bisa di-backfill (API hanya memberi saldo live).
 */
class BackfillStockSnapshot extends Command
{
    protected $signature = 'dwh:backfill-stock
        {--from= : Tanggal awal (Y-m-d). Default 12 bulan lalu.}
        {--to= : Tanggal akhir (Y-m-d). Default hari ini.}
        {--every=month : Kerapatan snapshot: month|week|day}';

    protected $description = 'Backfill riwayat snapshot stok ERP ke dwh_fact_inventory_snapshot';

    public function handle(ErpStockSyncService $erp): int
    {
        $to = $this->option('to') ? Carbon::parse($this->option('to')) : now();
        $from = $this->option('from') ? Carbon::parse($this->option('from')) : (clone $to)->subMonths(12);
        $every = $this->option('every');

        if ($from->gt($to)) {
            $this->error('--from tidak boleh setelah --to.');

            return self::FAILURE;
        }

        $dates = $this->dates($from, $to, $every);
        if (empty($dates)) {
            $this->error("Kerapatan '{$every}' tidak dikenal (pakai month|week|day).");

            return self::FAILURE;
        }

        $this->info(sprintf('Backfill %d tanggal (%s) dari %s s/d %s…', count($dates), $every, $from->toDateString(), $to->toDateString()));
        $bar = $this->output->createProgressBar(count($dates));
        $bar->start();

        $started = microtime(true);
        $items = 0;
        $failed = [];

        foreach ($dates as $d) {
            try {
                $r = $erp->sync($d);
                $items += $r['items'];
            } catch (\Throwable $e) {
                // Satu tanggal gagal tidak boleh menggagalkan seluruh backfill.
                $failed[] = $d;
                $this->newLine();
                $this->warn("  {$d} gagal: ".mb_substr($e->getMessage(), 0, 100));
            }
            $bar->advance();
        }

        $bar->finish();
        $this->newLine(2);

        $ms = (int) ((microtime(true) - $started) * 1000);
        $result = ['dates' => count($dates), 'items' => $items, 'failed' => count($failed)];
        SyncLog::record('dwh', 'DWH backfill stok ERP', $failed ? 'partial' : 'success', $result,
            $failed ? 'Gagal pada: '.implode(', ', $failed) : null, $ms, 'manual');

        $summary = DB::table(InventorySnapshot::TABLE)
            ->where('source', InventorySnapshot::ERP)
            ->selectRaw('COUNT(DISTINCT snapshot_date) dates, COUNT(*) `rows`, MIN(snapshot_date) mn, MAX(snapshot_date) mx')
            ->first();

        $this->info(sprintf('Selesai: %d tanggal, %d baris ditulis, %d gagal (%.1fs)', count($dates), $items, count($failed), $ms / 1000));
        $this->line(sprintf('Snapshot ERP kini: <info>%d tanggal</info>, %d baris (%s s/d %s)',
            $summary->dates, $summary->rows, $summary->mn, $summary->mx));

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    /** @return string[] Y-m-d */
    protected function dates(Carbon $from, Carbon $to, string $every): array
    {
        $out = [];
        $cursor = (clone $from);

        switch ($every) {
            case 'day':
                while ($cursor->lte($to)) {
                    $out[] = $cursor->toDateString();
                    $cursor->addDay();
                }
                break;
            case 'week':
                while ($cursor->lte($to)) {
                    $out[] = $cursor->toDateString();
                    $cursor->addWeek();
                }
                break;
            case 'month':
                // Pakai akhir bulan — titik potong yang lazim untuk laporan persediaan.
                $cursor = (clone $from)->endOfMonth();
                while ($cursor->lte($to)) {
                    $out[] = $cursor->toDateString();
                    $cursor->addMonthNoOverflow()->endOfMonth();
                }
                break;
            default:
                return [];
        }

        // Selalu sertakan tanggal akhir (mis. hari ini) supaya "stok terkini" ikut terisi.
        if (! in_array($to->toDateString(), $out, true)) {
            $out[] = $to->toDateString();
        }

        return $out;
    }
}
