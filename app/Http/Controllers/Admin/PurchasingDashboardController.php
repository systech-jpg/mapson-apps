<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AccurateSetting;
use App\Services\Accurate\AccurateService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Dashboard eksekutif Purchasing (menu reporting "Purchasing").
 *
 * Lima blok: (1) spending per principal — faktur pembelian Accurate terkonversi IDR;
 * (2) status PR & PO — ERP (supplier_proposal + commande_fournisseur); (3) lead time
 * request→PO→order→barang datang per principal — rantai element_element ERP;
 * (4) utang & CN per principal — saldo vendor live dari API Accurate (positif = utang,
 * negatif = kredit/CN); (5) analisa biaya impor — staging detailExpense faktur.
 *
 * Principal = pricing_principals via erp_societe_id (sisi ERP) / dwh_map_vendor_principal
 * (sisi Accurate); vendor tanpa mapping tampil dengan namanya sendiri.
 */
class PurchasingDashboardController extends Controller
{
    protected const DEFAULT_RATE = 16000;

    /** Ekspresi IDR utk baris staging Accurate (konvensi sama dgn Monitoring Pembelian). */
    protected function idrExpr(string $alias = 's'): string
    {
        return "{$alias}.total * CASE WHEN {$alias}.currency_code IS NULL OR {$alias}.currency_code = 'IDR' THEN 1
                ELSE COALESCE(fx.rate_to_idr, ".self::DEFAULT_RATE.') END';
    }

    public function index(Request $request): Response
    {
        $year = preg_match('/^\d{4}$/', (string) $request->input('year')) ? (string) $request->input('year') : null;

        $years = DB::table('dwh_stg_acc_purchase_invoice_item')
            ->selectRaw("DISTINCT LEFT(trans_date,4) th")->whereNotNull('trans_date')
            ->orderBy('th')->pluck('th')->filter()->values();

        return Inertia::render('dashboard/purchasing', [
            'year' => $year,
            'years' => $years,
            'spending' => $this->spending($year),
            'status' => $this->prPoStatus($year),
            'leadTime' => $this->leadTime($year),
            'balances' => $this->vendorBalances(),
            'importCost' => $this->importCost($year),
        ]);
    }

    /** (1) Total spending per principal, IDR — dari faktur pembelian Accurate. */
    protected function spending(?string $year): array
    {
        $rows = DB::table('dwh_stg_acc_purchase_invoice_item as s')
            ->leftJoin('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 's.vendor_name')
            ->leftJoin('pricing_principals as p', 'p.id', '=', 'm.principal_id')
            ->leftJoin('dwh_fx_rate as fx', function ($j) {
                $j->on('fx.currency', '=', 's.currency_code')->on('fx.period', '=', DB::raw('LEFT(s.trans_date, 7)'));
            })
            ->whereNotNull('s.trans_date')
            ->when($year, fn ($q) => $q->whereRaw('LEFT(s.trans_date,4) = ?', [$year]))
            ->groupBy('principal')
            ->selectRaw('COALESCE(p.name, s.vendor_name) AS principal,
                SUM('.$this->idrExpr().') AS idr, COUNT(DISTINCT s.doc_number) AS docs')
            ->orderByDesc('idr')
            ->get();

        return [
            'total_idr' => (float) $rows->sum('idr'),
            'rows' => $rows->take(12)->map(fn ($r) => ['principal' => $r->principal, 'idr' => (float) $r->idr, 'docs' => (int) $r->docs])->values(),
            'others_idr' => (float) $rows->slice(12)->sum('idr'),
            'others_n' => max(0, $rows->count() - 12),
        ];
    }

    /** (2) Jumlah PR & PO per status — ERP. */
    protected function prPoStatus(?string $year): array
    {
        $p = config('erp.prefix');

        $prLabels = [0 => 'Draft', 1 => 'Divalidasi', 2 => 'Disetujui', 3 => 'Ditolak', 4 => 'Ditutup'];
        $poLabels = [0 => 'Draft', 1 => 'Divalidasi', 2 => 'Approved', 3 => 'Ordered', 4 => 'Diterima sebagian', 5 => 'Diterima penuh', 6 => 'Dibatalkan', 7 => 'Dibatalkan', 9 => 'Ditolak'];

        $pr = collect(DB::connection(config('erp.connection'))->select(
            "SELECT fk_statut s, COUNT(*) n FROM {$p}supplier_proposal
             WHERE datec IS NOT NULL".($year ? ' AND LEFT(datec,4) = ?' : '').' GROUP BY fk_statut',
            $year ? [$year] : []));

        $po = collect(DB::connection(config('erp.connection'))->select(
            "SELECT fk_statut s, COUNT(*) n FROM {$p}commande_fournisseur
             WHERE COALESCE(date_commande, date_creation) >= '2000-01-01'".($year ? ' AND LEFT(COALESCE(date_commande, date_creation),4) = ?' : '').' GROUP BY fk_statut',
            $year ? [$year] : []));

        // "Open PO": sudah jalan tapi barang belum diterima penuh.
        $openPo = (int) $po->whereIn('s', [1, 2, 3, 4])->sum('n');

        return [
            'pr' => $pr->map(fn ($r) => ['label' => $prLabels[(int) $r->s] ?? "Status {$r->s}", 'statut' => (int) $r->s, 'n' => (int) $r->n])->sortBy('statut')->values(),
            'po' => $po->map(fn ($r) => ['label' => $poLabels[(int) $r->s] ?? "Status {$r->s}", 'statut' => (int) $r->s, 'n' => (int) $r->n])->sortBy('statut')->values(),
            'pr_total' => (int) $pr->sum('n'),
            'po_total' => (int) $po->sum('n'),
            'open_po' => $openPo,
        ];
    }

    /**
     * (3) Lead time rata-rata per principal (hari): request (PR dibuat) → PO dibuat →
     * order ke vendor (date_commande) → barang datang (reception pertama).
     * AVG mengabaikan NULL, jadi PO tanpa PR / tanpa reception tetap ikut di tahap lain.
     */
    protected function leadTime(?string $year): array
    {
        $p = config('erp.prefix');
        // Query jalan di koneksi ERP; pricing_principals ada di DB aplikasi (host MySQL sama),
        // jadi join lintas-database memakai nama DB eksplisit.
        $appDb = DB::connection()->getDatabaseName();

        $rows = collect(DB::connection(config('erp.connection'))->select("
            SELECT COALESCE(pp.name, so.nom) AS principal,
                   COUNT(*) AS n_po,
                   -- Segmen negatif (tanggal dokumen di-backdate) dikecualikan dari rata-rata.
                   ROUND(AVG(CASE WHEN DATEDIFF(c.date_creation, pr.pr_date) >= 0 THEN DATEDIFF(c.date_creation, pr.pr_date) END), 1) AS d_req_po,
                   ROUND(AVG(CASE WHEN DATEDIFF(c.date_commande, c.date_creation) >= 0 THEN DATEDIFF(c.date_commande, c.date_creation) END), 1) AS d_po_order,
                   ROUND(AVG(CASE WHEN DATEDIFF(rc.first_arrival, COALESCE(c.date_commande, c.date_creation)) >= 0 THEN DATEDIFF(rc.first_arrival, COALESCE(c.date_commande, c.date_creation)) END), 1) AS d_order_arrive,
                   ROUND(AVG(CASE WHEN DATEDIFF(rc.first_arrival, pr.pr_date) >= 0 THEN DATEDIFF(rc.first_arrival, pr.pr_date) END), 1) AS d_total,
                   SUM(rc.first_arrival IS NOT NULL) AS n_arrived
            FROM {$p}commande_fournisseur c
            LEFT JOIN {$p}societe so ON so.rowid = c.fk_soc
            LEFT JOIN `{$appDb}`.pricing_principals pp ON pp.erp_societe_id = so.rowid
            LEFT JOIN (
                SELECT ee.fk_target po_id, MIN(sp.datec) pr_date
                FROM {$p}element_element ee
                JOIN {$p}supplier_proposal sp ON sp.rowid = ee.fk_source
                WHERE ee.sourcetype = 'supplier_proposal' AND ee.targettype = 'order_supplier'
                GROUP BY ee.fk_target
            ) pr ON pr.po_id = c.rowid
            LEFT JOIN (
                SELECT ee.fk_source po_id, MIN(COALESCE(r.date_delivery, r.date_valid)) first_arrival
                FROM {$p}element_element ee
                JOIN {$p}reception r ON r.rowid = ee.fk_target
                WHERE ee.sourcetype = 'order_supplier' AND ee.targettype = 'reception'
                GROUP BY ee.fk_source
            ) rc ON rc.po_id = c.rowid
            WHERE c.fk_statut IN (2,3,4,5)
              AND COALESCE(c.date_commande, c.date_creation) >= '2000-01-01'
              ".($year ? ' AND LEFT(COALESCE(c.date_commande, c.date_creation),4) = ?' : '')."
            GROUP BY principal
            HAVING COUNT(*) > 0
            ORDER BY n_po DESC
        ", $year ? [$year] : []));

        return $rows->map(fn ($r) => [
            'principal' => $r->principal,
            'n_po' => (int) $r->n_po,
            'n_arrived' => (int) $r->n_arrived,
            'd_req_po' => $r->d_req_po !== null ? (float) $r->d_req_po : null,
            'd_po_order' => $r->d_po_order !== null ? (float) $r->d_po_order : null,
            'd_order_arrive' => $r->d_order_arrive !== null ? (float) $r->d_order_arrive : null,
            'd_total' => $r->d_total !== null ? (float) $r->d_total : null,
        ])->values()->all();
    }

    /**
     * (4) Saldo utang vendor LIVE dari Accurate (vendor/list.do): positif = utang (payable),
     * negatif = kredit kita di vendor (CN). Saldo dlm mata uang vendor → dikonversi IDR
     * memakai kurs terbaru. Gagal API (offline) → available=false, dashboard tetap tampil.
     */
    protected function vendorBalances(): array
    {
        try {
            $s = AccurateSetting::current();
            $acc = app(AccurateService::class);
            $all = [];
            $page = 1;
            do {
                $l = $acc->apiGet($s, 'vendor/list.do', ['fields' => 'id,name,balance', 'sp.pageSize' => 100, 'sp.page' => $page]);
                foreach ($l['d'] ?? [] as $r) {
                    if (abs((float) $r['balance']) > 0.01) {
                        $all[] = $r;
                    }
                }
                $pc = $l['sp']['pageCount'] ?? 1;
                $page++;
            } while ($page <= $pc);
        } catch (\Throwable $e) {
            return ['available' => false, 'error' => mb_substr($e->getMessage(), 0, 150), 'payable' => [], 'credit' => [], 'payable_idr' => 0, 'credit_idr' => 0];
        }

        // Mata uang & principal dari mapping; kurs terbaru per mata uang.
        $map = DB::table('dwh_map_vendor_principal as m')
            ->leftJoin('pricing_principals as p', 'p.id', '=', 'm.principal_id')
            ->get(['m.vendor_name', 'm.default_currency', 'p.name as principal'])
            ->keyBy(fn ($r) => $this->norm($r->vendor_name));
        $latestFx = DB::table('dwh_fx_rate')->orderBy('period')->get()
            ->groupBy('currency')->map(fn ($g) => (float) $g->last()->rate_to_idr);

        $payable = [];
        $credit = [];
        foreach ($all as $v) {
            $m = $map->get($this->norm($v['name']));
            $cur = $m->default_currency ?? 'IDR';
            $rate = $cur === 'IDR' ? 1 : ($latestFx[$cur] ?? self::DEFAULT_RATE);
            $row = [
                'principal' => $m->principal ?? $v['name'],
                'vendor' => $v['name'],
                'cur' => $cur,
                'amount' => abs((float) $v['balance']),
                'idr' => abs((float) $v['balance']) * $rate,
            ];
            if ((float) $v['balance'] > 0) {
                $payable[] = $row;
            } else {
                $credit[] = $row;
            }
        }
        usort($payable, fn ($a, $b) => $b['idr'] <=> $a['idr']);
        usort($credit, fn ($a, $b) => $b['idr'] <=> $a['idr']);

        return [
            'available' => true,
            'payable' => $payable,
            'credit' => $credit,
            'payable_idr' => array_sum(array_column($payable, 'idr')),
            'credit_idr' => array_sum(array_column($credit, 'idr')),
        ];
    }

    /**
     * (5) Analisa biaya impor: total biaya (staging detailExpense, konversi IDR via mata uang
     * vendor dokumen) vs nilai barang impor (baris item vendor non-IDR), komposisi per
     * kategori (PIB/bea, freight, storage, pajak, lainnya) dan per akun.
     */
    protected function importCost(?string $year): array
    {
        // Kategori dari catatan/akun — kata kunci nyata di data: PIB/DJBC, freight, storage.
        $catExpr = "CASE
            WHEN e.account_no IN ('1171000','1175000','2122000') OR e.account_name LIKE '%Tax%' OR e.account_name LIKE '%Art %' THEN 'Pajak (PPN/PPh)'
            WHEN e.notes LIKE '%PIB%' OR e.notes LIKE '%DJBC%' OR e.account_no = '5500000' THEN 'PIB / Bea & Cukai'
            WHEN e.notes LIKE '%storage%' THEN 'Storage'
            WHEN e.notes LIKE '%freight%' OR e.account_no = '5400000' THEN 'Freight & Handling'
            ELSE 'Lainnya' END";

        // Pengaman skala: baris pajak/biaya kadang di-input RUPIAH pada dokumen valas
        // (BS25-654 A: VAT 12,4jt di faktur USD). Baris valas >= 50.000 mustahil benar-benar
        // valas (USD 50rb utk satu baris biaya ≈ Rp 800jt) → perlakukan IDR.
        $idrExpr = "e.amount * CASE WHEN m.default_currency IS NULL OR m.default_currency = 'IDR' OR e.amount >= 50000 THEN 1
            ELSE COALESCE(fx.rate_to_idr, ".self::DEFAULT_RATE.') END';

        $base = fn () => DB::table('dwh_stg_acc_purchase_expense as e')
            ->leftJoin('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 'e.vendor_name')
            ->leftJoin('dwh_fx_rate as fx', function ($j) {
                $j->on('fx.currency', '=', 'm.default_currency')->on('fx.period', '=', DB::raw('LEFT(e.trans_date, 7)'));
            })
            ->whereNotNull('e.trans_date')
            ->when($year, fn ($q) => $q->whereRaw('LEFT(e.trans_date,4) = ?', [$year]));

        $byCategory = $base()
            ->groupBy('kategori')
            ->selectRaw("{$catExpr} AS kategori, SUM({$idrExpr}) AS idr, COUNT(*) AS n")
            ->orderByDesc('idr')
            ->get()
            ->map(fn ($r) => ['kategori' => $r->kategori, 'idr' => (float) $r->idr, 'n' => (int) $r->n]);

        $byAccount = $base()
            ->groupBy('e.account_no', 'e.account_name')
            ->selectRaw("e.account_no, e.account_name, SUM({$idrExpr}) AS idr, COUNT(*) AS n")
            ->orderByDesc('idr')
            ->get()
            ->map(fn ($r) => ['account' => trim(($r->account_no ?? '').' '.($r->account_name ?? '')), 'idr' => (float) $r->idr, 'n' => (int) $r->n]);

        // Basis: nilai barang IMPOR (vendor bermata uang asing) dlm IDR.
        $importGoods = (float) DB::table('dwh_stg_acc_purchase_invoice_item as s')
            ->join('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 's.vendor_name')
            ->leftJoin('dwh_fx_rate as fx', function ($j) {
                $j->on('fx.currency', '=', 's.currency_code')->on('fx.period', '=', DB::raw('LEFT(s.trans_date, 7)'));
            })
            ->where('m.default_currency', '<>', 'IDR')
            ->whereNotNull('s.trans_date')
            ->when($year, fn ($q) => $q->whereRaw('LEFT(s.trans_date,4) = ?', [$year]))
            ->selectRaw('SUM('.$this->idrExpr().') AS idr')
            ->value('idr');

        // Rate dihitung TANPA pajak (PPN/PPh bukan biaya impor murni — bisa dikreditkan).
        $costNonTax = (float) $byCategory->where('kategori', '<>', 'Pajak (PPN/PPh)')->sum('idr');

        return [
            'by_category' => $byCategory->values(),
            'by_account' => $byAccount->values(),
            'import_goods_idr' => $importGoods,
            'cost_idr' => $costNonTax,
            'cost_with_tax_idr' => (float) $byCategory->sum('idr'),
            'rate_pct' => $importGoods > 0 ? round($costNonTax / $importGoods * 100, 2) : null,
        ];
    }

    /**
     * Drill KPI: daftar detail di balik kartu Total Purchase (per dokumen faktur) dan
     * Open PO (PO berjalan + umur hari + progres penerimaan Accurate). Kartu Utang/CN
     * tidak lewat sini — datanya sudah per-vendor di props halaman.
     */
    public function kpiDrill(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:purchase,open_po,pr_status,po_status'],
            'year' => ['nullable', 'regex:/^\d{4}$/'],
            'principal' => ['nullable', 'string', 'max:255'],
            'statut' => ['nullable', 'integer'],
        ]);
        $year = $data['year'] ?? null;

        if ($data['type'] === 'pr_status' || $data['type'] === 'po_status') {
            return $this->statusDrill($data['type'], (int) ($data['statut'] ?? 0), $year);
        }

        if ($data['type'] === 'purchase') {
            // Kunci tracing = NOMOR PO ERP (po_number per baris faktur); dokumen Accurate
            // (invoice/packing slip) hanya info sekunder. Baris lama tanpa po_number
            // (2021-2022) jatuh ke nomor dokumennya sendiri, ditandai has_po=false.
            $rows = DB::table('dwh_stg_acc_purchase_invoice_item as s')
                ->leftJoin('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 's.vendor_name')
                ->leftJoin('pricing_principals as p', 'p.id', '=', 'm.principal_id')
                ->leftJoin('dwh_fx_rate as fx', function ($j) {
                    $j->on('fx.currency', '=', 's.currency_code')->on('fx.period', '=', DB::raw('LEFT(s.trans_date, 7)'));
                })
                ->whereNotNull('s.trans_date')
                ->when($year, fn ($q) => $q->whereRaw('LEFT(s.trans_date,4) = ?', [$year]))
                ->when($data['principal'] ?? null, fn ($q, $pr) => $q->havingRaw('principal = ?', [$pr]))
                ->groupBy('po', 'has_po', 's.vendor_name', 'principal', 'cur')
                ->selectRaw("COALESCE(NULLIF(s.po_number,''), s.doc_number) AS po,
                    (s.po_number IS NOT NULL AND s.po_number <> '') AS has_po,
                    s.vendor_name, COALESCE(p.name, s.vendor_name) AS principal,
                    COALESCE(s.currency_code,'IDR') AS cur,
                    MIN(s.trans_date) AS trans_date,
                    GROUP_CONCAT(DISTINCT s.doc_number ORDER BY s.trans_date SEPARATOR ', ') AS docs,
                    COUNT(DISTINCT s.doc_number) AS n_docs,
                    SUM(s.total) AS asli, SUM(".$this->idrExpr().') AS idr, COUNT(*) AS n_items')
                ->orderByDesc('idr')
                ->limit(800)
                ->get()
                ->map(fn ($r) => [
                    'po' => $r->po, 'has_po' => (bool) $r->has_po, 'docs' => $r->docs, 'n_docs' => (int) $r->n_docs,
                    'trans_date' => $r->trans_date, 'vendor' => $r->vendor_name,
                    'principal' => $r->principal, 'cur' => $r->cur, 'asli' => (float) $r->asli,
                    'idr' => (float) $r->idr, 'n_items' => (int) $r->n_items,
                ]);

            return response()->json(['rows' => $rows]);
        }

        // open_po: status 1-4 = sudah jalan, barang belum diterima penuh, tidak batal.
        $p = config('erp.prefix');
        $appDb = DB::connection()->getDatabaseName();
        $pos = collect(DB::connection(config('erp.connection'))->select("
            SELECT c.ref, COALESCE(pp.name, so.nom) AS principal, so.nom AS vendor,
                   LEFT(COALESCE(c.date_commande, c.date_creation),10) AS tanggal,
                   c.fk_statut, COALESCE(NULLIF(c.multicurrency_code,''),'IDR') AS cur,
                   c.multicurrency_total_ttc AS total,
                   DATEDIFF(CURDATE(), COALESCE(c.date_commande, c.date_creation)) AS umur
            FROM {$p}commande_fournisseur c
            LEFT JOIN {$p}societe so ON so.rowid = c.fk_soc
            LEFT JOIN `{$appDb}`.pricing_principals pp ON pp.erp_societe_id = so.rowid
            WHERE c.fk_statut IN (1,2,3,4)
              AND COALESCE(c.date_commande, c.date_creation) >= '2000-01-01'
              ".($year ? ' AND LEFT(COALESCE(c.date_commande, c.date_creation),4) = ?' : '')."
            ORDER BY tanggal ASC
        ", $year ? [$year] : []));

        // Progres penerimaan versi Accurate (percentShipped) — lookup by nomor PO.
        $accPos = DB::table('dwh_stg_acc_purchase_order')
            ->whereIn('number', $pos->pluck('ref')->all())
            ->get(['number', 'status_name', 'percent_shipped'])
            ->keyBy('number');

        $poLabels = [1 => 'Divalidasi', 2 => 'Approved', 3 => 'Ordered', 4 => 'Diterima sebagian'];

        return response()->json(['rows' => $pos->map(fn ($r) => [
            'ref' => $r->ref, 'principal' => $r->principal, 'vendor' => $r->vendor,
            'tanggal' => $r->tanggal, 'status' => $poLabels[(int) $r->fk_statut] ?? (string) $r->fk_statut,
            'cur' => $r->cur, 'total' => (float) $r->total, 'umur' => (int) $r->umur,
            'acc_status' => $accPos[$r->ref]->status_name ?? null,
            'acc_percent' => isset($accPos[$r->ref]) && $accPos[$r->ref]->percent_shipped !== null ? (float) $accPos[$r->ref]->percent_shipped : null,
        ])->values()]);
    }

    /** Drill status: daftar dokumen PR (supplier_proposal) atau PO (commande_fournisseur) per status. */
    protected function statusDrill(string $type, int $statut, ?string $year): \Illuminate\Http\JsonResponse
    {
        $p = config('erp.prefix');
        $appDb = DB::connection()->getDatabaseName();

        if ($type === 'pr_status') {
            $rows = collect(DB::connection(config('erp.connection'))->select("
                SELECT sp.ref, COALESCE(pp.name, so.nom) AS principal, so.nom AS vendor,
                       LEFT(sp.datec,10) AS tanggal,
                       COALESCE(NULLIF(sp.multicurrency_code,''),'IDR') AS cur,
                       COALESCE(sp.multicurrency_total_ht, sp.total_ht) AS total
                FROM {$p}supplier_proposal sp
                LEFT JOIN {$p}societe so ON so.rowid = sp.fk_soc
                LEFT JOIN `{$appDb}`.pricing_principals pp ON pp.erp_societe_id = so.rowid
                WHERE sp.fk_statut = ?".($year ? ' AND LEFT(sp.datec,4) = ?' : '').'
                ORDER BY sp.datec DESC',
                $year ? [$statut, $year] : [$statut]));

            return response()->json(['rows' => $rows->map(fn ($r) => [
                'ref' => $r->ref, 'principal' => $r->principal, 'vendor' => $r->vendor,
                'tanggal' => $r->tanggal, 'cur' => $r->cur, 'total' => (float) $r->total,
            ])->values()]);
        }

        // po_status — struktur sama dengan open_po tapi utk satu status persis (termasuk 0/5/6/9).
        $pos = collect(DB::connection(config('erp.connection'))->select("
            SELECT c.ref, COALESCE(pp.name, so.nom) AS principal, so.nom AS vendor,
                   LEFT(COALESCE(c.date_commande, c.date_creation),10) AS tanggal,
                   COALESCE(NULLIF(c.multicurrency_code,''),'IDR') AS cur,
                   c.multicurrency_total_ttc AS total,
                   DATEDIFF(CURDATE(), COALESCE(c.date_commande, c.date_creation)) AS umur
            FROM {$p}commande_fournisseur c
            LEFT JOIN {$p}societe so ON so.rowid = c.fk_soc
            LEFT JOIN `{$appDb}`.pricing_principals pp ON pp.erp_societe_id = so.rowid
            WHERE c.fk_statut = ?
              AND COALESCE(c.date_commande, c.date_creation) >= '2000-01-01'
              ".($year ? ' AND LEFT(COALESCE(c.date_commande, c.date_creation),4) = ?' : '').'
            ORDER BY tanggal DESC',
            $year ? [$statut, $year] : [$statut]));

        $accPos = DB::table('dwh_stg_acc_purchase_order')
            ->whereIn('number', $pos->pluck('ref')->all())
            ->get(['number', 'status_name', 'percent_shipped'])
            ->keyBy('number');

        return response()->json(['rows' => $pos->map(fn ($r) => [
            'ref' => $r->ref, 'principal' => $r->principal, 'vendor' => $r->vendor,
            'tanggal' => $r->tanggal, 'cur' => $r->cur, 'total' => (float) $r->total, 'umur' => (int) $r->umur,
            'acc_status' => $accPos[$r->ref]->status_name ?? null,
            'acc_percent' => isset($accPos[$r->ref]) && $accPos[$r->ref]->percent_shipped !== null ? (float) $accPos[$r->ref]->percent_shipped : null,
        ])->values()]);
    }

    /** Normalisasi nama vendor (identik dgn SQL normSql Monitoring Pembelian: buang spasi/./, lalu 'pt'). */
    protected function norm(?string $s): string
    {
        return str_replace('pt', '', str_replace([' ', '.', ','], '', strtolower((string) $s)));
    }
}
