<?php

namespace App\Services\Erp;

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
    /** Truncate + insert the ERP stock snapshot as of $asOf (Y-m-d, default today). */
    public function sync(?string $asOf = null): array
    {
        @set_time_limit(0);
        $asOf = $asOf ?: now()->toDateString();
        $rows = DB::connection(config('erp.connection'))->select($this->query($asOf));

        $now = now()->toDateTimeString();
        DB::table('erp_item_stock')->truncate();

        $count = 0;
        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('erp_item_stock')->insert(array_map(fn ($r) => [
                'erp_product_id' => $r->rowid,
                'ref' => $r->ref,
                'label' => $r->label,
                'principal' => $r->principal_name,
                'category_l2' => $r->category_l2,
                'buffer' => (float) ($r->buffer ?: 0),
                'qty' => (float) $r->qty,
                'snapshot_date' => $asOf,
                'synced_at' => $now,
            ], $chunk));
            $count += count($chunk);
        }

        return ['items' => $count, 'as_of' => $asOf];
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
                HAVING qty != 0
                ORDER BY p.ref";
    }
}
