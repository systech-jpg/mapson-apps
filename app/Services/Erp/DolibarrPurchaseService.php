<?php

namespace App\Services\Erp;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/**
 * Tulis ke Dolibarr via REST API: buat faktur supplier dari PO lalu catat payment-nya.
 *
 * Konteks: pembayaran vendor dicatat di Accurate, sehingga PO di Dolibarr berhenti tanpa
 * faktur (45 faktur vs 393 PO). Fitur ini "menutup" PO tersebut: faktur supplier dibuat
 * dari baris PO (tertaut via linkedObjectsIds), divalidasi, lalu payment dicatat lunas.
 *
 * Baca data (PO, bank, cara bayar) tetap lewat koneksi DB read-only; SEMUA penulisan
 * lewat REST API agar penomoran ref, trigger, dan jurnal bank Dolibarr tetap benar.
 */
class DolibarrPurchaseService
{
    /** Status PO yang boleh ditutup: 2=approved, 3=ordered, 4=diterima sebagian, 5=diterima penuh. */
    public const PAYABLE_STATUSES = [2, 3, 4, 5];

    public function enabled(): bool
    {
        return config('erp.api_url') !== '' && config('erp.api_key') !== '';
    }

    /** Panggil REST API Dolibarr. Lempar RuntimeException dgn pesan Dolibarr bila gagal. */
    protected function api(string $method, string $path, array $data = []): mixed
    {
        $resp = Http::withHeaders(['DOLAPIKEY' => config('erp.api_key')])
            ->acceptJson()
            ->timeout(60)
            ->{$method}(config('erp.api_url').'/api/index.php/'.ltrim($path, '/'), $data);

        if ($resp->failed()) {
            $msg = data_get($resp->json(), 'error.message', $resp->body());
            throw new \RuntimeException("Dolibarr API {$method} {$path} gagal (HTTP {$resp->status()}): ".mb_substr((string) $msg, 0, 300));
        }

        return $resp->json();
    }

    /** Header + baris PO dari DB (untuk disalin ke faktur). Null bila tak ketemu. */
    public function fetchPo(int $poId): ?object
    {
        $p = config('erp.prefix');
        $po = DB::connection(config('erp.connection'))->selectOne("
            SELECT c.rowid, c.ref, c.ref_supplier, c.fk_soc, c.fk_statut, c.billed,
                   COALESCE(c.date_commande, c.date_creation) AS date_po,
                   c.total_ht, c.total_ttc, c.multicurrency_code, c.multicurrency_tx, c.multicurrency_total_ttc,
                   so.nom AS vendor_name
            FROM {$p}commande_fournisseur c
            LEFT JOIN {$p}societe so ON so.rowid = c.fk_soc
            WHERE c.rowid = ?", [$poId]);
        if (! $po) {
            return null;
        }

        $po->lines = DB::connection(config('erp.connection'))->select("
            SELECT d.fk_product, d.ref AS ref_supplier, d.label, d.description, d.tva_tx, d.qty,
                   d.remise_percent, d.subprice, d.multicurrency_subprice, d.product_type
            FROM {$p}commande_fournisseurdet d
            WHERE d.fk_commande = ? ORDER BY d.rang, d.rowid", [$poId]);

        return $po;
    }

    /** Id faktur supplier yang sudah tertaut ke PO ini (deteksi dobel proses). */
    public function linkedInvoiceIds(int $poId): array
    {
        $p = config('erp.prefix');

        return array_map(fn ($r) => (int) $r->fk_target, DB::connection(config('erp.connection'))->select("
            SELECT fk_target FROM {$p}element_element
            WHERE sourcetype = 'order_supplier' AND fk_source = ? AND targettype = 'invoice_supplier'", [$poId]));
    }

    /**
     * Alur penuh: PO → faktur supplier (draft, baris disalin, tertaut PO) → validasi → payment lunas.
     * Kembalikan [invoice_id, ref]. Bila gagal di tengah, exception menyebut faktur yang terlanjur
     * dibuat supaya bisa dibereskan manual di Dolibarr.
     */
    public function payPo(int $poId, string $datePaye, int $bankAccountId, int $paymentModeId, string $note = ''): array
    {
        $po = $this->fetchPo($poId);
        if (! $po) {
            throw new \RuntimeException("PO #{$poId} tidak ditemukan.");
        }
        if (! in_array((int) $po->fk_statut, self::PAYABLE_STATUSES, true)) {
            throw new \RuntimeException("PO {$po->ref} berstatus {$po->fk_statut} (draft/batal) — tidak bisa dibuatkan faktur.");
        }
        if ($linked = $this->linkedInvoiceIds($poId)) {
            throw new \RuntimeException("PO {$po->ref} sudah punya faktur tertaut (id ".implode(',', $linked).') — tidak dibuat ulang.');
        }
        if (! $po->lines) {
            throw new \RuntimeException("PO {$po->ref} tidak punya baris item.");
        }

        // 1. Faktur draft: salin identitas PO, tautkan ke PO (element_element), tiru multicurrency
        //    apa adanya (PO USD di-input dgn tx=1 — konsisten dengan data lama).
        $invoiceId = (int) $this->api('post', 'supplierinvoices', [
            'socid' => (int) $po->fk_soc,
            'type' => 0,
            'date' => $datePaye,
            'ref_supplier' => $po->ref_supplier ?: $po->ref,
            'label' => 'Dari PO '.$po->ref.($note !== '' ? ' — '.$note : ''),
            'multicurrency_code' => $po->multicurrency_code ?: null,
            'multicurrency_tx' => (float) ($po->multicurrency_tx ?: 1),
            'linkedObjectsIds' => ['order_supplier' => (int) $po->rowid],
        ]);

        try {
            // 2. Salin tiap baris PO.
            foreach ($po->lines as $l) {
                $this->api('post', "supplierinvoices/{$invoiceId}/lines", [
                    'description' => $l->description ?: $l->label ?: '',
                    'pu_ht' => (float) $l->subprice,
                    'tva_tx' => (float) $l->tva_tx,
                    'qty' => (float) $l->qty,
                    'fk_product' => $l->fk_product ? (int) $l->fk_product : 0,
                    'remise_percent' => (float) $l->remise_percent,
                    'product_type' => (int) $l->product_type,
                    'multicurrency_subprice' => (float) ($l->multicurrency_subprice ?: $l->subprice),
                    'ref_supplier' => $l->ref_supplier ?: '',
                ]);
            }

            // 3. Validasi (dapat nomor ref resmi).
            $this->api('post', "supplierinvoices/{$invoiceId}/validate");

            // 4. Payment lunas: tanpa amount = bayar sisa penuh; closepaidinvoices menutup faktur.
            $this->api('post', "supplierinvoices/{$invoiceId}/payments", [
                'datepaye' => $datePaye,
                'payment_mode_id' => $paymentModeId,
                'closepaidinvoices' => 'yes',
                'accountid' => $bankAccountId,
                'comment' => $note !== '' ? $note : 'Payment dicatat dari Mapson Apps (pembayaran riil di Accurate)',
            ]);
        } catch (\RuntimeException $e) {
            throw new \RuntimeException($e->getMessage()." — faktur draft/id {$invoiceId} terlanjur dibuat di Dolibarr, periksa & bereskan di sana.", 0, $e);
        }

        $ref = data_get($this->api('get', "supplierinvoices/{$invoiceId}"), 'ref', (string) $invoiceId);

        return ['invoice_id' => $invoiceId, 'ref' => $ref];
    }
}
