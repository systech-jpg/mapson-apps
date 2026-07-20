<?php

namespace App\Console\Commands;

use App\Services\Accurate\AccurateSyncService;
use App\Models\SyncLog;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Tarik faktur pembelian SEMUA item dari Accurate → turunkan HPP (harga pokok) per item.
 *
 * Ini prasyarat P&L / ABC costing per produk: acc snapshot.unit_price = harga JUAL,
 * jadi biaya pokok HARUS datang dari faktur pembelian (endpoint purchase-invoice tak diblokir).
 * Idempoten: sync upsert by erp_id, recompute menimpa dwh_map_product_cost.
 */
class SyncProductCost extends Command
{
    protected $signature = 'dwh:sync-product-cost
        {--from= : Tanggal awal (Y-m-d). Default 24 bulan lalu.}
        {--to= : Tanggal akhir (Y-m-d). Default hari ini.}
        {--recompute-only : Lewati tarik API, hitung ulang HPP dari staging yang ada.}';

    protected $description = 'Sync faktur pembelian Accurate + hitung HPP per item ke dwh_map_product_cost';

    public function handle(AccurateSyncService $svc): int
    {
        $to = $this->option('to') ? Carbon::parse($this->option('to')) : now();
        $from = $this->option('from') ? Carbon::parse($this->option('from')) : (clone $to)->subMonths(24);

        if ($from->gt($to)) {
            $this->error('--from tidak boleh setelah --to.');

            return self::FAILURE;
        }

        $started = microtime(true);
        $result = [];

        if (! $this->option('recompute-only')) {
            $this->info(sprintf('Tarik faktur pembelian %s s/d %s…', $from->toDateString(), $to->toDateString()));
            try {
                $sync = $svc->syncPurchaseInvoices(
                    $from->format('d/m/Y'),
                    $to->format('d/m/Y'),
                    fn (string $m) => $this->line("  {$m}")
                );
                $result += $sync;
            } catch (\Throwable $e) {
                SyncLog::record('dwh', 'Sync faktur pembelian (HPP)', 'error', [], mb_substr($e->getMessage(), 0, 200),
                    (int) ((microtime(true) - $started) * 1000), 'manual');
                $this->error('Gagal: '.$e->getMessage());

                return self::FAILURE;
            }
            $this->info(sprintf('  %d dokumen, %d baris ke staging.', $result['purchase_docs'] ?? 0, $result['purchase_lines'] ?? 0));
        }

        $this->info('Hitung ulang HPP per item…');
        $result += $svc->recomputeProductCost();

        $ms = (int) ((microtime(true) - $started) * 1000);
        SyncLog::record('dwh', 'Sync faktur pembelian (HPP)', 'success', $result, null, $ms, 'manual');

        // Ringkasan + cakupan: berapa item bersaldo di snapshot yang sudah punya HPP.
        $costed = (int) ($result['items_costed'] ?? 0);
        $cov = DB::table('dwh_fact_inventory_snapshot as s')
            ->leftJoin('dwh_map_product_cost as c', 'c.item_no', '=', 's.ref')
            ->where('s.source', 'accurate')
            ->where('s.snapshot_date', DB::table('dwh_fact_inventory_snapshot')->where('source', 'accurate')->max('snapshot_date'))
            ->selectRaw('COUNT(DISTINCT s.ref) items, COUNT(DISTINCT CASE WHEN c.item_no IS NOT NULL THEN s.ref END) matched')
            ->first();

        $this->newLine();
        $this->info(sprintf('Selesai (%.1fs): %d item punya HPP.', $ms / 1000, $costed));
        if ($cov && $cov->items > 0) {
            $this->line(sprintf('Cakupan snapshot Accurate: <info>%d/%d</info> item bersaldo punya HPP (%.0f%%).',
                $cov->matched, $cov->items, $cov->matched / $cov->items * 100));
        }

        return self::SUCCESS;
    }
}
