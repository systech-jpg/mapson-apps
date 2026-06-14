<?php

namespace App\Services\Erp;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class SalesSyncService
{
    /**
     * Pull validated + paid invoice lines from the ERP and refresh the
     * local sales_facts table (full truncate + insert).
     *
     * @return int Number of rows loaded.
     */
    public function sync(): int
    {
        $rows = DB::connection(config('erp.connection'))->select($this->query());

        $now = Carbon::now();

        // Run the SELECT first; only wipe local data once we actually have results.
        DB::table('sales_facts')->truncate();

        foreach (array_chunk($rows, 500) as $chunk) {
            $insert = array_map(function ($row) use ($now) {
                $data = (array) $row;
                $data['synced_at'] = $now;

                return $data;
            }, $chunk);

            DB::table('sales_facts')->insert($insert);
        }

        return count($rows);
    }

    public function lastSyncedAt(): ?Carbon
    {
        $value = DB::table('sales_facts')->max('synced_at');

        return $value ? Carbon::parse($value) : null;
    }

    protected function query(): string
    {
        $p = config('erp.prefix');

        $entities = collect(explode(',', (string) config('erp.entities', '1')))
            ->map(fn ($e) => (int) trim($e))
            ->filter(fn ($e) => $e >= 0)
            ->implode(',') ?: '1';

        return <<<SQL
SELECT
    DATE_FORMAT(f.datef, '%Y')                                   AS tahun,
    s.nom                                                        AS bill_to,
    s.name_alias                                                 AS customer,
    f.datef                                                      AS purchase_date,
    COALESCE(extra_c.no_po_customer, f.ref_client)              AS purchase_number,
    e.date_delivery                                              AS do_date,
    COALESCE(extra_c.no_surat_jalan, e.ref)                     AS do_no,
    ''                                                           AS no_gr,
    CASE WHEN extra_c.salestype = 'Mobile' THEN 'Y' ELSE '' END  AS usage_report,
    ''                                                           AS bast_spk,
    extra.patientname                                            AS patient,
    f.datef                                                      AS invoice_date,
    f.ref                                                        AS invoice_no,
    f.note_public                                                AS remarks,
    extra.nofakturpajak                                          AS nomor_faktur,
    c.ref                                                        AS reff,
    p.ref                                                        AS part_number,
    CASE
        WHEN (p.label IS NULL OR p.label = '') THEN
            REPLACE(REPLACE(REPLACE(fd.description, '&quot;', '"'), '&nbsp;', ' '), '\\r\\n', ' ')
        ELSE
            REPLACE(REPLACE(REPLACE(p.label, '&quot;', '"'), '&nbsp;', ' '), '\\r\\n', ' ')
    END                                                          AS description,
    fd.qty                                                       AS quantity,
    cat_tree.Lvl_1                                               AS category_1,
    cat_tree.Lvl_2                                               AS category_2,
    cat_tree.Lvl_3                                               AS category_3,
    cat_tree.Lvl_4                                               AS category_4,
    (SELECT MAX(sup.nom)
       FROM {$p}product_fournisseur_price AS pfp
       JOIN {$p}societe AS sup ON pfp.fk_soc = sup.rowid
      WHERE pfp.fk_product = p.rowid)                            AS merk,
    ROUND(fd.subprice, 0)                                        AS price_qty,
    ROUND(fd.total_ht, 0)                                        AS total_price,
    ROUND(fd.remise_percent, 2)                                  AS disc,
    ROUND((fd.subprice * fd.qty * (COALESCE(fd.remise_percent,0)/100)), 0) AS disc_value,
    ROUND(fd.total_ht, 0)                                        AS dpp,
    ROUND(fd.total_tva, 0)                                       AS ppn,
    CASE WHEN f.type = 3 THEN ROUND(fd.total_ttc, 0) ELSE 0 END  AS down_payment,
    ROUND(fd.total_ttc, 0)                                       AS total,
    ''                                                           AS team,
    doc.fullname                                                 AS doctor,
    TRIM(CONCAT(u_sales.firstname, ' ', COALESCE(u_sales.lastname, ''))) AS sales,
    ''                                                           AS sales_2,
    CASE WHEN f.paye = 1 THEN 'PAID' ELSE 'UNPAID' END           AS paid_unpaid,
    ''                                                           AS tgl_tukar_faktur,
    cond.code                                                    AS tempo,
    f.date_lim_reglement                                         AS due_date,
    CASE WHEN f.paye = 1 THEN (
            SELECT MAX(pay.datep)
              FROM {$p}paiement_facture pf
              JOIN {$p}paiement pay ON pf.fk_paiement = pay.rowid
             WHERE pf.fk_facture = f.rowid)
         ELSE NULL END                                           AS payment_date,
    s.town                                                       AS region,
    u_tech.firstname                                             AS technical_support,
    f.rowid                                                      AS erp_invoice_id
FROM {$p}facturedet AS fd
LEFT JOIN {$p}facture AS f ON fd.fk_facture = f.rowid
LEFT JOIN {$p}societe AS s ON f.fk_soc = s.rowid
LEFT JOIN {$p}product AS p ON fd.fk_product = p.rowid
LEFT JOIN {$p}c_payment_term AS cond ON f.fk_cond_reglement = cond.rowid
LEFT JOIN {$p}facture_extrafields AS extra ON f.rowid = extra.fk_object
LEFT JOIN {$p}c_doctor AS doc ON extra.dokter = doc.rowid
LEFT JOIN {$p}element_element AS el_so ON (el_so.fk_target = f.rowid AND el_so.targettype = 'facture' AND el_so.sourcetype = 'commande')
LEFT JOIN {$p}commande AS c ON el_so.fk_source = c.rowid
LEFT JOIN {$p}commande_extrafields AS extra_c ON c.rowid = extra_c.fk_object
LEFT JOIN {$p}user AS u_sales ON extra_c.sales = u_sales.rowid
LEFT JOIN {$p}user AS u_tech ON extra_c.technical_support = u_tech.rowid
LEFT JOIN {$p}element_element AS el_ship ON (el_ship.fk_source = c.rowid AND el_ship.sourcetype = 'commande' AND el_ship.targettype = 'shipping')
LEFT JOIN {$p}expedition AS e ON el_ship.fk_target = e.rowid
LEFT JOIN (
    SELECT
        cp.fk_product,
        MAX(IF(c3.label IS NULL AND c2.label IS NULL AND c1.label IS NULL, c4.label,
           IF(c2.label IS NULL AND c1.label IS NULL, c3.label,
              IF(c1.label IS NULL, c2.label, c1.label)))) AS Lvl_1,
        MAX(IF(c1.label IS NOT NULL, c2.label,
           IF(c2.label IS NOT NULL, c3.label,
              IF(c3.label IS NOT NULL, c4.label, NULL)))) AS Lvl_2,
        MAX(IF(c1.label IS NOT NULL, c3.label,
           IF(c2.label IS NOT NULL, c4.label, NULL))) AS Lvl_3,
        MAX(IF(c1.label IS NOT NULL, c4.label, NULL)) AS Lvl_4
    FROM {$p}categorie_product cp
    JOIN {$p}categorie c4 ON cp.fk_categorie = c4.rowid
    LEFT JOIN {$p}categorie c3 ON c4.fk_parent = c3.rowid
    LEFT JOIN {$p}categorie c2 ON c3.fk_parent = c2.rowid
    LEFT JOIN {$p}categorie c1 ON c2.fk_parent = c1.rowid
    GROUP BY cp.fk_product
) AS cat_tree ON p.rowid = cat_tree.fk_product
WHERE f.entity IN ({$entities})
  AND f.fk_statut IN (1, 2)
ORDER BY f.datef DESC, f.ref DESC
SQL;
    }
}
