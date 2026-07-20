<?php

namespace App\Services\Erp;

use App\Support\InventorySnapshot;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Compute the ERP (Dolibarr) stock balance "as of" a date and stage it locally.
 *
 * Mirrors the company's report_all_stock.php saldo-akhir logic:
 *   stock = SUM(stock_mouvement.value × KIT qty)  −  SUM(usage_report_det.qty_used × KIT qty, deduped)
 * with 2-level KIT explosion (product_association) and usage_report deduplication
 * (skip usage already represented by a validated shipment). Component-level, all warehouses.
 */
class ErpStockSyncService
{
    /**
     * Hitung saldo stok ERP as of $asOf (Y-m-d, default hari ini) lalu simpan sebagai
     * satu baris per item pada tanggal itu di dwh_fact_inventory_snapshot.
     *
     * Upsert (bukan truncate) → riwayat tanggal lain tetap utuh, dan menjalankan ulang
     * tanggal yang sama hanya menimpa tanggal itu. Inilah yang membuat backfill mundur
     * dan Stock Aging / turnover jadi mungkin.
     *
     * CATATAN: hasilnya "as-of menurut pengetahuan hari ini", bukan "seperti tercatat
     * hari itu". Dolibarr menerima mutasi backdate (mis. 128 mutasi bertanggal <= 25 Jun
     * baru dicatat setelahnya), dan dedup usage memakai status expedition SAAT INI. Jadi
     * menjalankan ulang tanggal lampau BISA menghasilkan qty berbeda dari hasil sync
     * sebelumnya — itu koreksi data telat, bukan bug.
     */
    public function sync(?string $asOf = null): array
    {
        @set_time_limit(0);
        $asOf = $asOf ?: now()->toDateString();
        $rows = DB::connection(config('erp.connection'))->select($this->query($asOf));

        $now = now()->toDateTimeString();

        $count = 0;
        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table(InventorySnapshot::TABLE)->upsert(
                array_map(fn ($r) => [
                    'source' => InventorySnapshot::ERP,
                    'snapshot_date' => $asOf,
                    'ref' => $r->ref,
                    'label' => $r->label,
                    'qty' => (float) $r->qty,
                    'erp_product_id' => $r->rowid,
                    'principal' => $r->principal_name,
                    'category_l2' => $r->category_l2,
                    'buffer' => (float) ($r->buffer ?: 0),
                    'synced_at' => $now,
                ], $chunk),
                ['source', 'ref', 'snapshot_date'],
                ['label', 'qty', 'erp_product_id', 'principal', 'category_l2', 'buffer', 'synced_at'],
            );
            $count += count($chunk);
        }

        return ['items' => $count, 'as_of' => $asOf];
    }

    /**
     * Mutasi stok masuk vs keluar per bulan langsung dari Dolibarr `stock_mouvement`
     * (bukan ledger Accurate). `value` sudah bertanda: + masuk, − keluar. Dibatasi ke
     * produk dalam entity & tipe barang (mengikuti universe snapshot).
     *
     * $year null → rolling $months bulan terakhir dari pergerakan terbaru (agar chart
     * tak terlalu lebar & tetap terisi walau data telat). $year diisi → seluruh bulan
     * tahun itu.
     *
     * @return array{rows: array<int, array<string, mixed>>, from: ?string, to: ?string, total: int, years: int[], year: ?int}
     */
    public function movementsByMonth(?int $year = null, int $months = 12): array
    {
        $p = config('erp.prefix');
        $entities = collect((array) config('erp.entities'))->map(fn ($e) => (int) $e)->implode(',') ?: '1';
        $conn = DB::connection(config('erp.connection'));

        $where = "p.entity IN ({$entities}) AND p.fk_product_type = 0 AND p.ref NOT LIKE '%-MAP'";
        $from = "FROM {$p}stock_mouvement sm JOIN {$p}product p ON p.rowid = sm.fk_product WHERE {$where}";

        // Tahun yang tersedia (untuk dropdown filter).
        $years = array_map(
            fn ($r) => (int) $r->y,
            $conn->select("SELECT DISTINCT YEAR(sm.datem) y {$from} ORDER BY y DESC")
        );

        $empty = ['rows' => [], 'from' => null, 'to' => null, 'total' => 0, 'years' => $years, 'year' => $year];

        if ($year !== null) {
            $rows = $conn->select(
                "SELECT DATE_FORMAT(sm.datem, '%Y-%m') period, SUM(GREATEST(sm.value,0)) masuk,
                        SUM(-LEAST(sm.value,0)) keluar, COUNT(*) baris {$from} AND YEAR(sm.datem) = ?
                 GROUP BY period ORDER BY period",
                [$year]
            );
        } else {
            // Jangkar ke pergerakan terbaru, bukan hari ini.
            $maxDate = $conn->selectOne("SELECT MAX(sm.datem) mx {$from}")->mx;
            if ($maxDate === null) {
                return $empty;
            }
            $rows = $conn->select(
                "SELECT DATE_FORMAT(sm.datem, '%Y-%m') period, SUM(GREATEST(sm.value,0)) masuk,
                        SUM(-LEAST(sm.value,0)) keluar, COUNT(*) baris {$from}
                        AND sm.datem >= DATE_SUB(?, INTERVAL ? MONTH)
                 GROUP BY period ORDER BY period",
                [$maxDate, $months]
            );
        }

        return [
            'rows' => array_map(fn ($r) => [
                'period' => $r->period,
                'masuk' => (float) $r->masuk,
                'keluar' => (float) $r->keluar,
                'baris' => (int) $r->baris,
            ], $rows),
            'from' => $rows[0]->period ?? null,
            'to' => $rows ? end($rows)->period : null,
            'total' => (int) collect($rows)->sum('baris'),
            'years' => $years,
            'year' => $year,
        ];
    }

    /**
     * Rincian mutasi satu bulan (YYYY-MM) dari `stock_mouvement`: agregasi per item
     * (masuk/keluar) + rincian per tipe pergerakan. Untuk drill-down dari chart.
     *
     * @return array{period: string, summary: array<string, float|int>, byType: array<int, array<string, mixed>>, rows: array<int, array<string, mixed>>, truncated: bool}
     */
    public function movementDetailByMonth(string $period, int $limit = 500): array
    {
        $p = config('erp.prefix');
        $entities = collect((array) config('erp.entities'))->map(fn ($e) => (int) $e)->implode(',') ?: '1';
        $conn = DB::connection(config('erp.connection'));
        $where = "p.entity IN ({$entities}) AND p.fk_product_type = 0 AND p.ref NOT LIKE '%-MAP'
                  AND DATE_FORMAT(sm.datem, '%Y-%m') = ?";
        $joinWhere = "FROM {$p}stock_mouvement sm JOIN {$p}product p ON p.rowid = sm.fk_product WHERE {$where}";

        // Label ramah untuk type_mouvement Dolibarr (2=keluar, 3=masuk, 0/1=koreksi, 5=transfer).
        $typeLabel = fn ($t) => match ((string) $t) {
            '3' => 'Penerimaan (masuk)',
            '2' => 'Pengiriman (keluar)',
            '0', '1' => 'Koreksi / stok opname',
            '5' => 'Transfer gudang',
            default => 'Lainnya',
        };

        $agg = $conn->selectOne("SELECT COUNT(DISTINCT sm.fk_product) items, COUNT(*) baris,
            SUM(GREATEST(sm.value,0)) masuk, SUM(-LEAST(sm.value,0)) keluar {$joinWhere}", [$period]);

        $byType = array_map(fn ($r) => [
            'type' => (int) $r->type_mouvement,
            'label' => $typeLabel($r->type_mouvement),
            'baris' => (int) $r->baris,
            'masuk' => (float) $r->masuk,
            'keluar' => (float) $r->keluar,
        ], $conn->select("SELECT sm.type_mouvement, COUNT(*) baris,
            SUM(GREATEST(sm.value,0)) masuk, SUM(-LEAST(sm.value,0)) keluar
            {$joinWhere} GROUP BY sm.type_mouvement ORDER BY baris DESC", [$period]));

        $rows = array_map(fn ($r) => [
            'ref' => (string) $r->ref,
            'label' => (string) $r->label,
            'masuk' => (float) $r->masuk,
            'keluar' => (float) $r->keluar,
            'net' => (float) $r->masuk - (float) $r->keluar,
            'baris' => (int) $r->baris,
        ], $conn->select("SELECT p.ref, p.label, COUNT(*) baris,
            SUM(GREATEST(sm.value,0)) masuk, SUM(-LEAST(sm.value,0)) keluar
            {$joinWhere} GROUP BY p.ref, p.label
            ORDER BY (SUM(GREATEST(sm.value,0)) + SUM(-LEAST(sm.value,0))) DESC LIMIT {$limit}", [$period]));

        return [
            'period' => $period,
            'summary' => [
                'items' => (int) ($agg->items ?? 0),
                'baris' => (int) ($agg->baris ?? 0),
                'masuk' => (float) ($agg->masuk ?? 0),
                'keluar' => (float) ($agg->keluar ?? 0),
            ],
            'byType' => $byType,
            'rows' => $rows,
            'truncated' => (int) ($agg->items ?? 0) > $limit,
        ];
    }

    /**
     * Per-product movement ledger up to $asOf (KIT-aware), for tracing a stock difference.
     * Combines stock_mouvement (IN via reception/PO, OUT via shipment/SO) + usage_report (medical OUT).
     *
     * @return array<int, object>
     */
    public function movements(int $productId, ?string $asOf = null, ?string $from = null, int $limit = 5000): array
    {
        $p = config('erp.prefix');
        $end = ($asOf ?: now()->toDateString()).' 23:59:59';
        $start = ($from ?: '1970-01-01').' 00:00:00';
        $id = (int) $productId;

        $sql = "
            SELECT dt, dir, qty, label, so_ref, do_ref, po_ref, gr_ref, src FROM (
                SELECT sm.datem AS dt, 'OUT' AS dir,
                    (sm.value * COALESCE(pa.qty, 1) * COALESCE(pa2.qty, 1)) AS qty,
                    COALESCE(sm.label, 'Manual Out') AS label,
                    so.ref AS so_ref, e.ref AS do_ref, NULL AS po_ref, NULL AS gr_ref, 'mouvement' AS src
                FROM {$p}stock_mouvement sm
                LEFT JOIN {$p}expedition e ON sm.origintype = 'shipping' AND e.rowid = sm.fk_origin
                LEFT JOIN {$p}element_element ee ON ee.targettype = 'shipping' AND ee.fk_target = e.rowid AND ee.sourcetype = 'commande'
                LEFT JOIN {$p}commande so ON so.rowid = ee.fk_source
                LEFT JOIN {$p}product_association pa ON pa.fk_product_pere = sm.fk_product
                LEFT JOIN {$p}product_association pa2 ON pa2.fk_product_pere = pa.fk_product_fils
                WHERE COALESCE(pa2.fk_product_fils, pa.fk_product_fils, sm.fk_product) = {$id} AND sm.value < 0 AND sm.datem <= '{$end}' AND sm.datem >= '{$start}'

                UNION ALL

                SELECT m.datem, 'IN',
                    (m.value * COALESCE(pa.qty, 1) * COALESCE(pa2.qty, 1)),
                    COALESCE(m.label, 'Manual In'),
                    NULL, NULL, cf.ref, r.ref, 'mouvement'
                FROM {$p}stock_mouvement m
                LEFT JOIN {$p}reception r ON m.origintype = 'reception' AND m.fk_origin = r.rowid
                LEFT JOIN {$p}element_element el ON el.fk_target = r.rowid AND el.targettype = 'reception' AND el.sourcetype = 'order_supplier'
                LEFT JOIN {$p}commande_fournisseur cf ON el.fk_source = cf.rowid
                LEFT JOIN {$p}product_association pa ON pa.fk_product_pere = m.fk_product
                LEFT JOIN {$p}product_association pa2 ON pa2.fk_product_pere = pa.fk_product_fils
                WHERE COALESCE(pa2.fk_product_fils, pa.fk_product_fils, m.fk_product) = {$id} AND m.value > 0 AND m.datem <= '{$end}' AND m.datem >= '{$start}'

                UNION ALL

                SELECT ur.date_creation, 'OUT',
                    (urd.qty_used * COALESCE(pa.qty, 1) * COALESCE(pa2.qty, 1)) * -1,
                    CONCAT('Usage: ', ur.ref),
                    so_ur.ref, t.ref_sj, NULL, NULL, 'usage'
                FROM {$p}usage_report_det urd
                JOIN {$p}usage_report ur ON ur.rowid = urd.fk_usage_report
                LEFT JOIN {$p}tindakan t ON t.id = ur.fk_tindakan
                LEFT JOIN {$p}commande so_ur ON so_ur.rowid = ur.fk_so
                LEFT JOIN {$p}product_association pa ON pa.fk_product_pere = urd.fk_product
                LEFT JOIN {$p}product_association pa2 ON pa2.fk_product_pere = pa.fk_product_fils
                WHERE COALESCE(pa2.fk_product_fils, pa.fk_product_fils, urd.fk_product) = {$id} AND urd.qty_used > 0 AND ur.date_creation <= '{$end}' AND ur.date_creation >= '{$start}'
                  AND (ur.fk_so IS NULL OR ur.fk_so = 0 OR NOT EXISTS (
                        SELECT 1 FROM {$p}element_element ee2 JOIN {$p}expedition ex ON ex.rowid = ee2.fk_target
                        WHERE ee2.sourcetype = 'commande' AND ee2.targettype = 'shipping' AND ee2.fk_source = ur.fk_so AND ex.fk_statut > 0))
            ) mv
            ORDER BY dt DESC
            LIMIT {$limit}";

        return DB::connection(config('erp.connection'))->select($sql);
    }

    /**
     * Tindakan/usage entries for $productId where the item is in the kit but qty_used = 0,
     * limited to the given SJ refs. Used so a delivery note (SJ) that exists in ERP as a
     * tindakan still appears as a comparison row (ERP qty 0) against the Accurate SJ, even
     * though nothing was consumed. Keyed by SJ; qty is implicitly 0.
     *
     * @param  list<string>  $sjRefs
     * @return array<int, object>
     */
    public function usageZeroBySj(int $productId, ?string $from, ?string $to, array $sjRefs): array
    {
        $sjRefs = array_values(array_filter(array_unique($sjRefs)));
        if (! $sjRefs) {
            return [];
        }
        $p = config('erp.prefix');
        $id = (int) $productId;
        $start = ($from ?: '1970-01-01').' 00:00:00';
        $end = ($to ?: now()->toDateString()).' 23:59:59';
        $in = implode(',', array_fill(0, count($sjRefs), '?'));

        $sql = "SELECT t.ref_sj AS do_ref, MAX(ur.date_creation) AS dt, COUNT(*) AS ln
                FROM {$p}usage_report_det urd
                JOIN {$p}usage_report ur ON ur.rowid = urd.fk_usage_report
                JOIN {$p}tindakan t ON t.id = ur.fk_tindakan
                LEFT JOIN {$p}product_association pa ON pa.fk_product_pere = urd.fk_product
                LEFT JOIN {$p}product_association pa2 ON pa2.fk_product_pere = pa.fk_product_fils
                WHERE COALESCE(pa2.fk_product_fils, pa.fk_product_fils, urd.fk_product) = {$id}
                  AND urd.qty_used = 0 AND ur.date_creation BETWEEN ? AND ?
                  AND t.ref_sj IN ({$in})
                GROUP BY t.ref_sj";

        return DB::connection(config('erp.connection'))->select($sql, array_merge([$start, $end], $sjRefs));
    }

    private function query(string $asOf): string
    {
        $p = config('erp.prefix');
        $entities = config('erp.entities', '1');
        $end = $asOf.' 23:59:59';

        // Net stock movements per component product (KIT-exploded), up to as-of date.
        $qMov = "SELECT COALESCE(pa2.fk_product_fils, pa.fk_product_fils, sm.fk_product) AS fk_product,
                    SUM(sm.value * COALESCE(pa.qty, 1) * COALESCE(pa2.qty, 1)) AS mov
                 FROM {$p}stock_mouvement sm
                 LEFT JOIN {$p}product_association pa ON pa.fk_product_pere = sm.fk_product
                 LEFT JOIN {$p}product_association pa2 ON pa2.fk_product_pere = pa.fk_product_fils
                 WHERE sm.datem <= '{$end}'
                 GROUP BY 1";

        // Medical usage consumption (KIT-exploded), up to as-of, excluding usage already shipped.
        $qUr = "SELECT COALESCE(pa2.fk_product_fils, pa.fk_product_fils, urd.fk_product) AS fk_product,
                    SUM(urd.qty_used * COALESCE(pa.qty, 1) * COALESCE(pa2.qty, 1)) AS ur
                FROM {$p}usage_report_det urd
                JOIN {$p}usage_report ur ON ur.rowid = urd.fk_usage_report
                LEFT JOIN {$p}product_association pa ON pa.fk_product_pere = urd.fk_product
                LEFT JOIN {$p}product_association pa2 ON pa2.fk_product_pere = pa.fk_product_fils
                WHERE urd.qty_used > 0 AND ur.date_creation <= '{$end}'
                  AND (ur.fk_so IS NULL OR ur.fk_so = 0 OR NOT EXISTS (
                        SELECT 1 FROM {$p}element_element ee
                        JOIN {$p}expedition ex ON ex.rowid = ee.fk_target
                        WHERE ee.sourcetype = 'commande' AND ee.targettype = 'shipping'
                          AND ee.fk_source = ur.fk_so AND ex.fk_statut > 0))
                GROUP BY 1";

        return "SELECT p.rowid, p.ref, p.label, p.seuil_stock_alerte AS buffer,
                    COALESCE(s.nom, CAST(pe.principal AS CHAR)) AS principal_name,
                    (SELECT c2.label FROM {$p}categorie_product cp
                        JOIN {$p}categorie c4 ON c4.rowid = cp.fk_categorie
                        LEFT JOIN {$p}categorie c3 ON c3.rowid = c4.fk_parent
                        LEFT JOIN {$p}categorie c2 ON c2.rowid = c3.fk_parent
                        WHERE cp.fk_product = p.rowid LIMIT 1) AS category_l2,
                    (COALESCE(sm.mov, 0) - COALESCE(su.ur, 0)) AS qty
                FROM {$p}product p
                LEFT JOIN {$p}product_extrafields pe ON p.rowid = pe.fk_object
                LEFT JOIN {$p}societe s ON pe.principal = s.rowid
                LEFT JOIN ({$qMov}) sm ON sm.fk_product = p.rowid
                LEFT JOIN ({$qUr}) su ON su.fk_product = p.rowid
                WHERE p.entity IN ({$entities}) AND p.fk_product_type = 0 AND p.ref NOT LIKE '%-MAP'
                  -- Item yang PERNAH punya mutasi/pemakaian saja. Sengaja tidak memakai
                  -- `HAVING qty != 0` agar item yang stoknya kini HABIS tetap tercatat
                  -- (justru itu yang dicari), tanpa menyeret ~9.100 produk yang tak
                  -- pernah bergerak sama sekali ke dalam snapshot harian.
                  AND (sm.fk_product IS NOT NULL OR su.fk_product IS NOT NULL)
                ORDER BY p.ref";
    }
}
