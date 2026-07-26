<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Monitoring Pembelian — total pembelian per principal per tahun, drill-down ke detail item.
 *
 * Sumber: dwh_stg_acc_purchase_invoice_item (faktur pembelian Accurate). Kolom `total` bermata
 * uang campur (IDR lokal, USD impor), jadi konversi ke IDR memakai dwh_fx_rate per (mata uang,
 * bulan); IDR = 1. Kurs yang belum terisi jatuh ke DEFAULT_RATE (asumsi, ditandai di UI).
 *
 * Principal diturunkan dari vendor lewat dwh_map_vendor_principal; vendor tak berprincipal
 * tampil dengan namanya sendiri (bukan disembunyikan) agar total tetap tie-back ke pembelian.
 */
class PurchaseMonitorController extends Controller
{
    /** Kurs cadangan bila dwh_fx_rate belum punya baris untuk (mata uang, bulan) itu. */
    protected const DEFAULT_RATE = 16000;

    /** Label principal efektif: nama principal bila terpetakan, selain itu nama vendor. */
    protected const PRINCIPAL_LABEL = 'COALESCE(p.name, s.vendor_name)';

    /** Ekspresi nilai IDR per baris: IDR apa adanya, mata uang lain dikali kurs bulan itu. */
    protected function idrExpr(): string
    {
        return "s.total * CASE WHEN s.currency_code IS NULL OR s.currency_code = 'IDR' THEN 1
                ELSE COALESCE(fx.rate_to_idr, ".self::DEFAULT_RATE.") END";
    }

    /** Query pembelian + join mapping vendor/principal + kurs. */
    protected function base()
    {
        return DB::table('dwh_stg_acc_purchase_invoice_item as s')
            ->leftJoin('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 's.vendor_name')
            ->leftJoin('pricing_principals as p', 'p.id', '=', 'm.principal_id')
            ->leftJoin('dwh_fx_rate as fx', function ($j) {
                $j->on('fx.currency', '=', 's.currency_code')->on('fx.period', '=', DB::raw('LEFT(s.trans_date, 7)'));
            });
    }

    public function index(): Response
    {
        // Agregasi mentah: per (principal, tahun, mata uang) → nilai asli + nilai IDR.
        $rows = $this->base()
            ->selectRaw(self::PRINCIPAL_LABEL.' AS principal, LEFT(s.trans_date,4) AS tahun, s.currency_code AS cur,
                SUM(s.total) AS asli, SUM('.$this->idrExpr().') AS idr, COUNT(*) AS n,
                MAX(m.principal_id IS NOT NULL) AS is_mapped')
            ->whereNotNull('s.trans_date')
            ->groupBy('principal', 'tahun', 'cur')
            ->get();

        $years = $rows->pluck('tahun')->unique()->sort()->values();

        // Pivot principal × tahun (nilai IDR), plus rincian mata uang asli & total.
        $byPrincipal = [];
        foreach ($rows as $r) {
            $key = $r->principal ?? '(Tanpa Vendor)';
            $byPrincipal[$key] ??= ['principal' => $key, 'is_mapped' => false, 'years' => [], 'currencies' => [], 'total_idr' => 0.0, 'n' => 0];
            $byPrincipal[$key]['years'][$r->tahun] = ($byPrincipal[$key]['years'][$r->tahun] ?? 0) + (float) $r->idr;
            $byPrincipal[$key]['currencies'][$r->cur ?? 'IDR'] = ($byPrincipal[$key]['currencies'][$r->cur ?? 'IDR'] ?? 0) + (float) $r->asli;
            $byPrincipal[$key]['total_idr'] += (float) $r->idr;
            $byPrincipal[$key]['n'] += (int) $r->n;
            $byPrincipal[$key]['is_mapped'] = $byPrincipal[$key]['is_mapped'] || (bool) $r->is_mapped;
        }
        $principals = collect($byPrincipal)->sortByDesc('total_idr')->values();

        return Inertia::render('purchase-monitor/index', [
            'years' => $years,
            'principals' => $principals,
            'summary' => [
                'total_idr' => (float) $principals->sum('total_idr'),
                'n_principal' => $principals->count(),
                'n_mapped' => $principals->where('is_mapped', true)->count(),
                'n_lines' => (int) $principals->sum('n'),
            ],
            'fx' => $this->fxStatus(),
        ]);
    }

    /** Detail item pembelian untuk satu principal + tahun (drill-down). */
    public function drilldown(Request $request): JsonResponse
    {
        $principal = (string) $request->input('principal');
        $year = (string) $request->input('year');

        $items = $this->base()
            ->whereRaw(self::PRINCIPAL_LABEL.' = ?', [$principal])
            ->whereRaw('LEFT(s.trans_date,4) = ?', [$year])
            ->orderByDesc('s.trans_date')
            ->limit(2000)
            ->selectRaw('s.trans_date, s.doc_number, s.vendor_name, s.item_no, s.item_name, s.qty, s.unit,
                s.currency_code AS cur, s.total AS asli, '.$this->idrExpr().' AS idr,
                COALESCE(fx.rate_to_idr, CASE WHEN s.currency_code IS NULL OR s.currency_code=\'IDR\' THEN 1 ELSE '.self::DEFAULT_RATE.' END) AS rate')
            ->get()
            ->map(fn ($r) => [
                'trans_date' => $r->trans_date, 'doc_number' => $r->doc_number, 'vendor_name' => $r->vendor_name,
                'item_no' => $r->item_no, 'item_name' => $r->item_name, 'qty' => (float) $r->qty, 'unit' => $r->unit,
                'currency' => $r->cur ?? 'IDR', 'asli' => (float) $r->asli, 'rate' => (float) $r->rate, 'idr' => (float) $r->idr,
            ]);

        return response()->json(['items' => $items]);
    }

    /** Normalisasi nama vendor/supplier agar bisa dicocokkan lintas sistem. */
    protected function normSql(string $col): string
    {
        return "REPLACE(REPLACE(REPLACE(REPLACE(LOWER($col),' ',''),'.',''),',',''),'pt','')";
    }

    /**
     * Rekonsiliasi pembelian Accurate vs Dolibarr per vendor × tahun × mata uang.
     *
     * Kedua sistem tak berbagi kunci dokumen (nomor Accurate ≠ ref Dolibarr), jadi pencocokan
     * memakai nama vendor ternormalisasi + tahun + mata uang, dan membandingkan NILAI ASLI
     * (bukan IDR — kurs Dolibarr tak andal). Tiap baris ditandai: cocok / selisih / hanya di
     * salah satu sisi.
     *
     * Sisi Dolibarr = PO (commande_fournisseur) status ordered/partial/full receive, BUKAN
     * faktur: pembayaran dicatat di Accurate sehingga faktur pembelian Dolibarr nyaris tak
     * pernah dibuat (45 faktur vs 393 PO).
     */
    /**
     * Status PO Dolibarr yang dihitung: 2=approved, 3=ordered, 4=diterima sebagian,
     * 5=diterima penuh. Status 2 ikut karena tim kadang berhenti di Approved tanpa
     * menandai Ordered padahal pembeliannya jalan (kasus Arjaya PO/I/2501/00087).
     */
    protected const DOL_PO_STATUSES = '2,3,4,5';

    public function reconciliation(): Response
    {
        // Sisi Accurate (mata uang dari mapping vendor).
        $acc = DB::table('dwh_stg_acc_purchase_invoice_item as s')
            ->whereNotNull('s.trans_date')
            ->groupBy('s.vendor_name', 'norm', 'tahun', 'cur')
            ->selectRaw('s.vendor_name, '.$this->normSql('s.vendor_name').' AS norm, LEFT(s.trans_date,4) AS tahun,
                COALESCE(s.currency_code,\'IDR\') AS cur, SUM(s.total) AS total, COUNT(DISTINCT s.doc_number) AS docs')
            ->get();

        // Sisi Dolibarr: PO status approved/ordered/partial/full, nilai NON-PPN
        // (multicurrency_total_ht) — staging Accurate menyimpan nilai net, sedangkan TTC PO
        // campuran (sebagian ber-PPN 11%); pakai HT membuat kedua sisi apel-ke-apel.
        // PO lama 2021-2023 nilainya 0 semua — dibuang lewat HAVING agar tak jadi baris hampa.
        $p = config('erp.prefix');
        $dol = collect(DB::connection(config('erp.connection'))->select("
            SELECT so.nom AS vendor_name, ".$this->normSql('so.nom')." AS norm,
                   LEFT(COALESCE(c.date_commande, c.date_creation),4) AS tahun,
                   COALESCE(NULLIF(c.multicurrency_code,''),'IDR') AS cur,
                   SUM(c.multicurrency_total_ht) AS total, COUNT(*) AS docs
            FROM {$p}commande_fournisseur c
            LEFT JOIN {$p}societe so ON so.rowid = c.fk_soc
            WHERE c.fk_statut IN (".self::DOL_PO_STATUSES.")
              AND COALESCE(c.date_commande, c.date_creation) >= '2000-01-01'
            GROUP BY so.nom, norm, tahun, cur
            HAVING SUM(c.multicurrency_total_ht) <> 0
        "));

        // Gabung berdasarkan (norm, tahun) SAJA — mata uang bisa beda antar sistem untuk vendor
        // yang sama (Globus↔AAI by design; Dwipa kasus salah input), jadi tiap sisi menyimpan
        // rincian per mata uang dan nilai hanya dibandingkan bila mata uang kedua sisi sama.
        $merged = [];
        $key = fn ($r) => $r->norm.'|'.$r->tahun;
        foreach ($acc as $r) {
            $m = &$merged[$key($r)];
            $m ??= ['vendor' => $r->vendor_name, 'tahun' => $r->tahun, 'acc_parts' => [], 'dol_parts' => []];
            $m['acc_parts'][$r->cur] = ['cur' => $r->cur, 'total' => (float) $r->total, 'docs' => (int) $r->docs];
            unset($m);
        }
        foreach ($dol as $r) {
            $m = &$merged[$key($r)];
            $m ??= ['vendor' => $r->vendor_name, 'tahun' => $r->tahun, 'acc_parts' => [], 'dol_parts' => []];
            $m['dol_parts'][$r->cur] = ['cur' => $r->cur, 'total' => (float) $r->total, 'docs' => (int) $r->docs];
            $m['vendor'] = $m['vendor'] ?: $r->vendor_name;
            unset($m);
        }

        $rows = collect($merged)->map(function ($m) {
            $accCurs = array_keys($m['acc_parts']);
            $dolCurs = array_keys($m['dol_parts']);
            if (! $m['dol_parts']) {
                $m['status'] = 'acc_only';
                $m['selisih'] = null;
            } elseif (! $m['acc_parts']) {
                $m['status'] = 'dol_only';
                $m['selisih'] = null;
            } elseif ($accCurs === $dolCurs && count($accCurs) === 1) {
                $cur = $accCurs[0];
                $m['selisih'] = round($m['acc_parts'][$cur]['total'] - $m['dol_parts'][$cur]['total'], 2);
                $m['status'] = abs($m['selisih']) < 1 ? 'match' : 'diff';
            } else {
                // Mata uang tak sejajar antar sisi — nilai tak bisa dibanding langsung; rincian di drill.
                $m['status'] = 'cur_mix';
                $m['selisih'] = null;
            }
            $m['acc_parts'] = array_values($m['acc_parts']);
            $m['dol_parts'] = array_values($m['dol_parts']);

            return $m;
        })->sortBy([['tahun', 'desc'], ['vendor', 'asc']])->values();

        $erp = app(\App\Services\Erp\DolibarrPurchaseService::class);

        return Inertia::render('purchase-monitor/reconciliation', [
            'rows' => $rows,
            'years' => $rows->pluck('tahun')->unique()->sort()->values(),
            'summary' => [
                'match' => $rows->where('status', 'match')->count(),
                'diff' => $rows->where('status', 'diff')->count(),
                'cur_mix' => $rows->where('status', 'cur_mix')->count(),
                'acc_only' => $rows->where('status', 'acc_only')->count(),
                'dol_only' => $rows->where('status', 'dol_only')->count(),
            ],
            // Pendukung fitur "buat faktur + payment dari PO" (tulis via REST API Dolibarr).
            'erpApiReady' => $erp->enabled(),
            'bankAccounts' => $this->erpBankAccounts(),
            'paymentModes' => $this->erpPaymentModes(),
        ]);
    }

    /** Rekening bank Dolibarr yang masih buka (untuk dialog payment). */
    protected function erpBankAccounts(): array
    {
        try {
            $p = config('erp.prefix');

            return array_map(fn ($r) => ['id' => (int) $r->rowid, 'ref' => $r->ref, 'label' => $r->label, 'currency' => $r->currency_code],
                DB::connection(config('erp.connection'))->select(
                    "SELECT rowid, ref, label, currency_code FROM {$p}bank_account WHERE clos = 0 ORDER BY label"));
        } catch (\Throwable) {
            return [];
        }
    }

    /** Cara pembayaran aktif Dolibarr (transfer, tunai, dst). */
    protected function erpPaymentModes(): array
    {
        try {
            $p = config('erp.prefix');

            return array_map(fn ($r) => ['id' => (int) $r->id, 'code' => $r->code, 'label' => $r->libelle],
                DB::connection(config('erp.connection'))->select(
                    "SELECT id, code, libelle FROM {$p}c_paiement WHERE active = 1 ORDER BY id"));
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * Daftar PO Dolibarr utk satu sel rekon (vendor ternormalisasi × tahun × mata uang),
     * plus status sudah/belum punya faktur tertaut — sumber tombol "buat payment".
     */
    public function reconPos(Request $request): JsonResponse
    {
        // Sel drill = vendor × tahun (TANPA mata uang — bisa beda antar sistem utk vendor sama).
        $data = $request->validate([
            'vendor' => ['required', 'string'],
            'year' => ['required', 'string', 'size:4'],
        ]);

        $p = config('erp.prefix');
        $norm = $this->normSql('so.nom');
        $normParam = $this->normSql('?');
        $pos = DB::connection(config('erp.connection'))->select("
            SELECT c.rowid, c.ref, c.ref_supplier, c.fk_statut,
                   LEFT(COALESCE(c.date_commande, c.date_creation),10) AS tanggal,
                   COALESCE(NULLIF(c.multicurrency_code,''),'IDR') AS cur,
                   c.multicurrency_total_ht AS total, c.multicurrency_total_ttc AS total_ttc,
                   GROUP_CONCAT(DISTINCT f.ref) AS invoice_refs,
                   MAX(f.paye) AS invoice_paid
            FROM {$p}commande_fournisseur c
            LEFT JOIN {$p}societe so ON so.rowid = c.fk_soc
            LEFT JOIN {$p}element_element ee ON ee.sourcetype = 'order_supplier' AND ee.fk_source = c.rowid AND ee.targettype = 'invoice_supplier'
            LEFT JOIN {$p}facture_fourn f ON f.rowid = ee.fk_target
            WHERE c.fk_statut IN (".self::DOL_PO_STATUSES.")
              AND {$norm} = {$normParam}
              AND LEFT(COALESCE(c.date_commande, c.date_creation),4) = ?
            GROUP BY c.rowid, c.ref, c.ref_supplier, c.fk_statut, tanggal, cur, total, total_ttc
            ORDER BY tanggal", [$data['vendor'], $data['year']]);

        // Dokumen faktur Accurate sel yang sama, dipecah per (dokumen × nomor PO) — po_number
        // per baris = ref PO Dolibarr (alur bisnis: PO lahir di Dolibarr → di-input ke Accurate),
        // sehingga faktur multi-PO dan realisasi parsial terurai eksak per PO.
        $accDocs = DB::table('dwh_stg_acc_purchase_invoice_item')
            ->whereRaw($this->normSql('vendor_name').' = '.$this->normSql('?'), [$data['vendor']])
            ->whereRaw('LEFT(trans_date,4) = ?', [$data['year']])
            ->groupBy('doc_number', 'trans_date', 'po_number', 'currency_code')
            ->orderBy('trans_date')
            ->selectRaw("doc_number, trans_date, po_number, COALESCE(currency_code,'IDR') AS cur, ROUND(SUM(total),2) AS total, COUNT(*) AS n_items")
            ->get()
            ->map(fn ($r) => ['doc_number' => $r->doc_number, 'trans_date' => $r->trans_date, 'cur' => $r->cur,
                'po_number' => $r->po_number, 'total' => (float) $r->total, 'n_items' => (int) $r->n_items]);

        // PO Accurate utk badge status — lookup by NOMOR saja (tanpa filter tahun/vendor):
        // tanggal bisa beda antar sistem (kasus PO/I/2508/00198: ERP 2026-04, Accurate 2025-08).
        $accPos = DB::table('dwh_stg_acc_purchase_order')
            ->whereIn('number', array_map(fn ($r) => $r->ref, $pos))
            ->get(['number', 'status_name', 'percent_shipped', 'currency_code', 'rate', 'total_amount'])
            ->keyBy('number')
            ->map(fn ($r) => ['status_name' => $r->status_name, 'percent_shipped' => $r->percent_shipped !== null ? (float) $r->percent_shipped : null,
                'currency' => $r->currency_code, 'rate' => $r->rate !== null ? (float) $r->rate : null, 'total' => (float) $r->total_amount]);

        // Semua PO Dolibarr vendor ini (tanpa filter tahun/mata uang/status) — untuk menjelaskan
        // dokumen "tanpa pasangan": PO-nya ada di ERP tapi di luar sel (beda mata uang/tahun,
        // kasus PO/I/2606/000052 salah input USD), atau memang tak ada sama sekali.
        $dolAllPos = collect(DB::connection(config('erp.connection'))->select("
            SELECT c.ref, LEFT(COALESCE(c.date_commande, c.date_creation),10) AS tanggal,
                   COALESCE(NULLIF(c.multicurrency_code,''),'IDR') AS cur, c.fk_statut
            FROM {$p}commande_fournisseur c
            LEFT JOIN {$p}societe so ON so.rowid = c.fk_soc
            WHERE ".$this->normSql('so.nom').' = '.$this->normSql('?'), [$data['vendor']]))
            ->keyBy('ref')
            ->map(fn ($r) => ['tanggal' => $r->tanggal, 'cur' => $r->cur, 'statut' => (int) $r->fk_statut]);

        // Payment Accurate vendor ini (staging) — sumber tanggal bayar & bank riil di form.
        $payments = DB::table('dwh_stg_acc_purchase_payment')
            ->whereRaw($this->normSql('vendor_name').' = '.$this->normSql('?'), [$data['vendor']])
            ->whereRaw('LEFT(trans_date,4) >= ?', [$data['year']])
            ->orderByDesc('trans_date')->limit(200)
            ->get(['number', 'trans_date', 'bank_no', 'bank_name', 'payment_method', 'invoice_number', 'bill_number', 'payment_amount'])
            ->map(fn ($r) => [
                'number' => $r->number, 'trans_date' => $r->trans_date, 'bank_no' => $r->bank_no,
                'bank_name' => $r->bank_name, 'payment_method' => $r->payment_method,
                'invoice_number' => $r->invoice_number, 'bill_number' => $r->bill_number,
                'amount' => (float) $r->payment_amount,
            ]);

        return response()->json(['pos' => array_map(fn ($r) => [
            'id' => (int) $r->rowid, 'ref' => $r->ref, 'ref_supplier' => $r->ref_supplier,
            'tanggal' => $r->tanggal, 'total' => (float) $r->total, 'total_ttc' => (float) $r->total_ttc, 'statut' => (int) $r->fk_statut,
            'invoice_refs' => $r->invoice_refs, 'invoice_paid' => $r->invoice_paid !== null ? (bool) $r->invoice_paid : null,
        ], $pos), 'accDocs' => $accDocs, 'accPos' => $accPos, 'dolAllPos' => $dolAllPos, 'payments' => $payments]);
    }

    /** Buat faktur supplier + payment lunas di Dolibarr untuk satu PO (via REST API). */
    public function payPo(Request $request, \App\Services\Erp\DolibarrPurchaseService $erp): RedirectResponse
    {
        $data = $request->validate([
            'po_id' => ['required', 'integer'],
            'date' => ['required', 'date_format:Y-m-d'],
            'bank_account_id' => ['required', 'integer'],
            'payment_mode_id' => ['required', 'integer'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        if (! $erp->enabled()) {
            return back()->with('error', 'REST API ERP belum dikonfigurasi (isi ERP_API_URL & ERP_API_KEY di .env).');
        }

        try {
            $res = $erp->payPo($data['po_id'], $data['date'], $data['bank_account_id'], $data['payment_mode_id'], (string) ($data['note'] ?? ''));
        } catch (\Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Faktur {$res['ref']} dibuat & payment dicatat di ERP.");
    }

    /**
     * Rekonsiliasi LEVEL PO: satu baris per nomor PO, ERP (Dolibarr) vs Accurate berdampingan.
     * Kuncinya eksak — nomor PO Accurate = ref PO Dolibarr (alur: PO lahir di Dolibarr →
     * di-input ke Accurate). Nilai yang dibanding: TTC dokumen (multicurrency_total_ttc vs
     * totalAmount Accurate — keduanya total dokumen termasuk pajak bila ada).
     */
    public function poReconciliation(): Response
    {
        $p = config('erp.prefix');
        $dol = DB::connection(config('erp.connection'))->select("
            SELECT c.ref, so.nom AS vendor, LEFT(COALESCE(c.date_commande, c.date_creation),10) AS tanggal,
                   c.fk_statut, COALESCE(NULLIF(c.multicurrency_code,''),'IDR') AS cur,
                   c.multicurrency_total_ttc AS ttc, c.multicurrency_total_ht AS ht
            FROM {$p}commande_fournisseur c
            LEFT JOIN {$p}societe so ON so.rowid = c.fk_soc
            WHERE c.fk_statut IN (".self::DOL_PO_STATUSES.")
              AND COALESCE(c.date_commande, c.date_creation) >= '2000-01-01'
        ");
        $acc = DB::table('dwh_stg_acc_purchase_order')->get();

        $merged = [];
        foreach ($dol as $r) {
            $merged[$r->ref] = [
                'number' => $r->ref, 'vendor' => $r->vendor, 'tanggal' => $r->tanggal, 'cur' => $r->cur,
                'dol_ttc' => (float) $r->ttc, 'dol_ht' => (float) $r->ht, 'dol_statut' => (int) $r->fk_statut,
                'acc_total' => null, 'acc_status' => null, 'acc_percent' => null, 'acc_cur' => null,
            ];
        }
        foreach ($acc as $r) {
            $m = &$merged[$r->number];
            $m ??= ['number' => $r->number, 'vendor' => $r->vendor_name, 'tanggal' => $r->trans_date, 'cur' => $r->currency_code ?? 'IDR',
                'dol_ttc' => null, 'dol_ht' => null, 'dol_statut' => null,
                'acc_total' => null, 'acc_status' => null, 'acc_percent' => null, 'acc_cur' => null];
            $m['acc_total'] = (float) $r->total_amount;
            $m['acc_status'] = $r->status_name;
            $m['acc_percent'] = $r->percent_shipped !== null ? (float) $r->percent_shipped : null;
            $m['acc_cur'] = $r->currency_code;
            unset($m);
        }

        $rows = collect($merged)->map(function ($m) {
            $m['selisih'] = $m['dol_ttc'] !== null && $m['acc_total'] !== null ? round($m['dol_ttc'] - $m['acc_total'], 2) : null;
            $m['status'] = $m['acc_total'] === null ? 'erp_only'
                : ($m['dol_ttc'] === null ? 'acc_only' : (abs($m['selisih']) < 1 ? 'match' : 'diff'));

            return $m;
        })->sortByDesc('tanggal')->values();

        return Inertia::render('purchase-monitor/po-reconciliation', [
            'rows' => $rows,
            'years' => $rows->pluck('tanggal')->filter()->map(fn ($t) => substr($t, 0, 4))->unique()->sort()->values(),
            'summary' => [
                'match' => $rows->where('status', 'match')->count(),
                'diff' => $rows->where('status', 'diff')->count(),
                'erp_only' => $rows->where('status', 'erp_only')->count(),
                'acc_only' => $rows->where('status', 'acc_only')->count(),
            ],
        ]);
    }

    /** Halaman kelola: mapping vendor→principal + mata uang, dan kurs per bulan. */
    public function settings(): Response
    {
        // Vendor dari staging + statistik + mapping saat ini.
        $vendors = DB::table('dwh_stg_acc_purchase_invoice_item as s')
            ->leftJoin('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 's.vendor_name')
            ->whereNotNull('s.vendor_name')
            ->groupBy('s.vendor_name', 'm.principal_id', 'm.default_currency')
            ->selectRaw('s.vendor_name, COUNT(*) n_lines, ROUND(SUM(s.total),2) total_asli,
                m.principal_id, COALESCE(m.default_currency, \'IDR\') default_currency')
            ->orderByDesc(DB::raw('COUNT(*)'))
            ->get();

        return Inertia::render('purchase-monitor/settings', [
            'vendors' => $vendors,
            'principals' => $this->principalOptions(),
            'fxRates' => DB::table('dwh_fx_rate')->orderByDesc('period')->orderBy('currency')
                ->get(['id', 'currency', 'period', 'rate_to_idr', 'source', 'note']),
            'currencies' => ['IDR', 'USD', 'EUR', 'SGD', 'CNY', 'JPY', 'GBP'],
            'lastSync' => DB::table('sync_logs')->where('source', 'Sync faktur pembelian (HPP)')
                ->where('status', 'success')->orderByDesc('created_at')->first(['created_at', 'summary']),
            'dataRange' => DB::table('dwh_stg_acc_purchase_invoice_item')
                ->selectRaw('MIN(trans_date) dari, MAX(trans_date) sampai, COUNT(*) n')->first(),
        ]);
    }

    /**
     * Tarik faktur pembelian Accurate dari tombol (tanpa akses terminal server), lalu langsung
     * selaraskan mapping vendor + mata uang. Sinkron & bisa lama (panggilan API per periode) —
     * pola sama dengan fetchFx.
     */
    public function syncPurchases(Request $request): RedirectResponse
    {
        @set_time_limit(0);
        $data = $request->validate(['from' => ['nullable', 'date_format:Y-m-d']]);

        try {
            $exit = Artisan::call('dwh:sync-product-cost', array_filter(['--from' => $data['from'] ?? null]));
        } catch (\Throwable $e) {
            return back()->with('error', 'Gagal sync pembelian: '.$e->getMessage());
        }
        if ($exit !== 0) {
            $summary = collect(preg_split('/\r?\n/', trim(Artisan::output())))->last() ?: '';

            return back()->with('error', 'Sync pembelian gagal. '.$summary);
        }

        $added = $this->syncVendorMap();

        // Tarik juga PO Accurate (status proses + mata uang & kurs riil dokumen) dan
        // pembayaran pembelian (tanggal bayar + bank riil utk fitur payment PO).
        $payMsg = '';
        try {
            $from = $data['from'] ? \Illuminate\Support\Carbon::parse($data['from']) : now()->subMonths(24);
            $svc = app(\App\Services\Accurate\AccurateSyncService::class);
            $po = $svc->syncPurchaseOrders($from->format('d/m/Y'), now()->format('d/m/Y'));
            $pay = $svc->syncPurchasePayments($from->format('d/m/Y'), now()->format('d/m/Y'));
            $payMsg = " {$po['po_docs']} PO & {$pay['payment_docs']} payment Accurate tersinkron.";
            $this->syncVendorMap(); // ulangi: mata uang vendor kini bisa dari dokumen PO
        } catch (\Throwable $e) {
            $payMsg = ' (Sync PO/payment gagal: '.mb_substr($e->getMessage(), 0, 120).')';
        }

        return back()->with('success', 'Pembelian tersinkron.'.($added > 0 ? " {$added} vendor baru terdaftar," : '').' mata uang & konversi sudah diperbarui.'.$payMsg);
    }

    /**
     * Pilihan principal utk dropdown: yang sudah terdaftar di app + supplier Dolibarr
     * (fournisseur=1) yang belum tertaut — pola sama dengan PricingEngineController::principals().
     * Memilih supplier Dolibarr akan otomatis membuat baris pricing_principals saat disimpan.
     */
    protected function principalOptions(): array
    {
        $app = DB::table('pricing_principals')->where('is_active', 1)->orderBy('name')
            ->get(['id', 'erp_societe_id', 'name'])
            ->map(fn ($p) => ['id' => (int) $p->id, 'erp_societe_id' => $p->erp_societe_id ? (int) $p->erp_societe_id : null, 'name' => $p->name, 'source' => $p->erp_societe_id ? 'erp' : 'app'])
            ->all();

        $linked = collect($app)->pluck('erp_societe_id')->filter()->all();

        $vendors = [];
        try {
            $p = config('erp.prefix');
            $entities = array_filter(array_map('trim', explode(',', (string) config('erp.entities', '1'))));
            $vendors = DB::connection(config('erp.connection'))->table($p.'societe')
                ->where('fournisseur', 1)
                ->when($entities, fn ($q) => $q->whereIn('entity', $entities))
                ->when($linked, fn ($q) => $q->whereNotIn('rowid', $linked))
                ->orderBy('nom')
                ->limit(2000)
                ->get(['rowid as erp_societe_id', 'nom as name'])
                ->map(fn ($v) => ['id' => null, 'erp_societe_id' => (int) $v->erp_societe_id, 'name' => $v->name, 'source' => 'erp'])
                ->all();
        } catch (\Throwable) {
            // ERP offline — tampilkan principal app saja.
        }

        return [...$app, ...$vendors];
    }

    /** Simpan mapping satu vendor + turunkan mata uang ke baris staging-nya. */
    public function storeMapping(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'vendor_name' => ['required', 'string'],
            'principal_id' => ['nullable', 'integer', 'exists:pricing_principals,id'],
            'erp_societe_id' => ['nullable', 'integer'],
            'principal_name' => ['nullable', 'string', 'max:255'],
            'default_currency' => ['required', 'string', 'size:3'],
        ]);

        // Supplier Dolibarr yang belum terdaftar → buat/tautkan pricing_principals dulu.
        if (empty($data['principal_id']) && ! empty($data['erp_societe_id'])) {
            $data['principal_id'] = \App\Models\PricingPrincipal::updateOrCreate(
                ['erp_societe_id' => $data['erp_societe_id']],
                ['name' => $data['principal_name'] ?: 'Societe #'.$data['erp_societe_id']],
            )->id;
        }

        // Mata uang yang diset lewat UI = manual → dilindungi dari tebakan ulang saat sync.
        DB::table('dwh_map_vendor_principal')->updateOrInsert(
            ['vendor_name' => $data['vendor_name']],
            ['principal_id' => $data['principal_id'] ?? null, 'default_currency' => $data['default_currency'],
                'currency_source' => 'manual', 'updated_at' => now(), 'created_at' => now()],
        );

        // Selaraskan mata uang baris pembelian vendor ini (kecuali yang sudah dari dokumen).
        DB::table('dwh_stg_acc_purchase_invoice_item')->where('vendor_name', $data['vendor_name'])
            ->update(['currency_code' => $data['default_currency']]);

        return back()->with('success', 'Mapping vendor disimpan.');
    }

    /**
     * Ambil kurs historis via command fx:fetch dari tombol (tanpa akses terminal server).
     * Sinkron: tiap bulan satu panggilan API, jadi rentang penuh bisa belasan detik.
     */
    public function fetchFx(Request $request): RedirectResponse
    {
        @set_time_limit(0);
        $currency = strtoupper((string) $request->input('currency', 'USD'));

        try {
            $exit = Artisan::call('fx:fetch', array_filter(['--currency' => $currency]));
        } catch (\Throwable $e) {
            return back()->with('error', 'Gagal mengambil kurs: '.$e->getMessage());
        }

        // Ringkasan diambil dari baris terakhir output command ("Selesai: X ..., Y gagal.").
        $summary = collect(preg_split('/\r?\n/', trim(Artisan::output())))->last() ?: '';

        return $exit === 0
            ? back()->with('success', 'Kurs diperbarui. '.$summary)
            : back()->with('error', 'Sebagian/semua kurs gagal diambil (server perlu akses internet). '.$summary);
    }

    /** Simpan/timpa kurs sebuah (mata uang, bulan) — ditandai manual. */
    public function storeFx(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'currency' => ['required', 'string', 'size:3'],
            'period' => ['required', 'string', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
            'rate_to_idr' => ['required', 'numeric', 'min:0'],
        ]);

        DB::table('dwh_fx_rate')->updateOrInsert(
            ['currency' => strtoupper($data['currency']), 'period' => $data['period']],
            ['rate_to_idr' => $data['rate_to_idr'], 'source' => 'manual', 'note' => 'diisi manual', 'updated_at' => now(), 'created_at' => now()],
        );

        return back()->with('success', 'Kurs disimpan.');
    }

    /** Ambang harga satuan: baris < 600rb khas USD, ≥ 600rb khas IDR. */
    protected const USD_LINE_THRESHOLD = 600000;

    /**
     * Selaraskan mapping dengan staging: daftarkan vendor baru, tebak mata uang vendor 'auto'
     * (dominan < 600rb → USD), lalu turunkan currency_code ke SEMUA baris. Vendor yang mata
     * uangnya diset manual tidak diganggu. Idempoten — aman dijalankan tiap habis sync.
     */
    public function refreshVendors(): RedirectResponse
    {
        $added = $this->syncVendorMap();

        return back()->with('success', $added > 0 ? "{$added} vendor baru ditambahkan; mata uang & konversi diperbarui." : 'Mata uang & konversi diperbarui.');
    }

    /** Inti refreshVendors, juga dipanggil otomatis setelah syncPurchases. Kembalikan jumlah vendor baru. */
    protected function syncVendorMap(): int
    {
        $t = self::USD_LINE_THRESHOLD;

        $added = DB::affectingStatement('
            INSERT IGNORE INTO dwh_map_vendor_principal (vendor_name, default_currency, currency_source, created_at, updated_at)
            SELECT DISTINCT vendor_name, \'IDR\', \'auto\', NOW(), NOW()
            FROM dwh_stg_acc_purchase_invoice_item WHERE vendor_name IS NOT NULL
        ');

        // Mata uang vendor dari DOKUMEN PO Accurate bila ada (mayoritas dokumen) — sumber
        // paling akurat; heuristik <600rb di bawah hanya utk vendor tanpa data PO.
        DB::statement("
            UPDATE dwh_map_vendor_principal m
            JOIN (
                SELECT vendor_name, SUBSTRING_INDEX(GROUP_CONCAT(currency_code ORDER BY cnt DESC), ',', 1) cur
                FROM (
                    SELECT vendor_name, currency_code, COUNT(*) cnt
                    FROM dwh_stg_acc_purchase_order
                    WHERE currency_code IS NOT NULL AND vendor_name IS NOT NULL
                    GROUP BY vendor_name, currency_code
                ) x GROUP BY vendor_name
            ) g ON g.vendor_name = m.vendor_name
            SET m.default_currency = g.cur, m.updated_at = NOW()
            WHERE m.currency_source = 'auto'
        ");

        // Tebak mata uang via aturan DOMINAN <600rb — hanya vendor 'auto' TANPA data PO Accurate.
        DB::statement("
            UPDATE dwh_map_vendor_principal m
            JOIN (
                SELECT vendor_name, CASE WHEN SUM(total < {$t}) > SUM(total >= {$t}) THEN 'USD' ELSE 'IDR' END cur
                FROM dwh_stg_acc_purchase_invoice_item GROUP BY vendor_name
            ) g ON g.vendor_name = m.vendor_name
            SET m.default_currency = g.cur, m.updated_at = NOW()
            WHERE m.currency_source = 'auto'
              AND NOT EXISTS (SELECT 1 FROM dwh_stg_acc_purchase_order o
                              WHERE o.vendor_name = m.vendor_name AND o.currency_code IS NOT NULL)
        ");

        // Turunkan mata uang ke seluruh baris (data hasil sync tak menyimpan currency sendiri).
        DB::statement('
            UPDATE dwh_stg_acc_purchase_invoice_item s
            JOIN dwh_map_vendor_principal m ON m.vendor_name = s.vendor_name
            SET s.currency_code = m.default_currency
        ');

        return $added;
    }

    /** Ringkasan kualitas kurs: berapa bulan-mata-uang masih asumsi vs sumber eksternal. */
    protected function fxStatus(): array
    {
        $bySource = DB::table('dwh_fx_rate')->selectRaw('source, COUNT(*) n')->groupBy('source')->pluck('n', 'source');

        return [
            'manual' => (int) ($bySource['manual'] ?? 0),
            'external' => (int) ($bySource['external'] ?? 0),
            'default_rate' => self::DEFAULT_RATE,
        ];
    }
}
