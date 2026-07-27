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
                'vendor_id' => (int) $v['id'],
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
    /** Kategori biaya dari catatan/akun — kata kunci nyata di data: PIB/DJBC, freight, storage. */
    protected function expCatExpr(): string
    {
        return "CASE
            WHEN e.account_no IN ('1171000','1175000','2122000') OR e.account_name LIKE '%Tax%' OR e.account_name LIKE '%Art %' THEN 'Pajak (PPN/PPh)'
            WHEN e.notes LIKE '%PIB%' OR e.notes LIKE '%DJBC%' OR e.account_no = '5500000' THEN 'PIB / Bea & Cukai'
            WHEN e.notes LIKE '%storage%' THEN 'Storage'
            WHEN e.notes LIKE '%freight%' OR e.account_no = '5400000' THEN 'Freight & Handling'
            ELSE 'Lainnya' END";
    }

    /**
     * IDR per baris biaya. Pengaman skala: baris pajak/biaya kadang di-input RUPIAH pada
     * dokumen valas (BS25-654 A: VAT 12,4jt di faktur USD). Baris valas >= 50.000 mustahil
     * benar-benar valas (USD 50rb utk satu baris ≈ Rp 800jt) → perlakukan IDR.
     */
    protected function expIdrExpr(): string
    {
        return "e.amount * CASE WHEN m.default_currency IS NULL OR m.default_currency = 'IDR' OR e.amount >= 50000 THEN 1
            ELSE COALESCE(fx.rate_to_idr, ".self::DEFAULT_RATE.') END';
    }

    protected function importCost(?string $year): array
    {
        $catExpr = $this->expCatExpr();
        $idrExpr = $this->expIdrExpr();

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

        // Tren per TAHUN (selalu semua tahun, tak ikut filter — utk melihat pergerakan rate).
        $costYear = DB::table('dwh_stg_acc_purchase_expense as e')
            ->leftJoin('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 'e.vendor_name')
            ->leftJoin('dwh_fx_rate as fx', function ($j) {
                $j->on('fx.currency', '=', 'm.default_currency')->on('fx.period', '=', DB::raw('LEFT(e.trans_date, 7)'));
            })
            ->whereNotNull('e.trans_date')
            ->groupBy('th')
            ->selectRaw("LEFT(e.trans_date,4) AS th,
                SUM(CASE WHEN {$catExpr} <> 'Pajak (PPN/PPh)' THEN {$idrExpr} ELSE 0 END) AS cost,
                SUM({$idrExpr}) AS cost_tax")
            ->pluck('cost', 'th');
        $goodsYear = DB::table('dwh_stg_acc_purchase_invoice_item as s')
            ->join('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 's.vendor_name')
            ->leftJoin('dwh_fx_rate as fx', function ($j) {
                $j->on('fx.currency', '=', 's.currency_code')->on('fx.period', '=', DB::raw('LEFT(s.trans_date, 7)'));
            })
            ->where('m.default_currency', '<>', 'IDR')
            ->whereNotNull('s.trans_date')
            ->groupBy('th')
            ->selectRaw('LEFT(s.trans_date,4) AS th, SUM('.$this->idrExpr().') AS goods')
            ->pluck('goods', 'th');
        $byYear = collect($goodsYear->keys()->merge($costYear->keys())->unique()->sort()->values())
            ->map(fn ($th) => [
                'tahun' => $th,
                'goods' => (float) ($goodsYear[$th] ?? 0),
                'cost' => (float) ($costYear[$th] ?? 0),
                'rate_pct' => ($goodsYear[$th] ?? 0) > 0 ? round(($costYear[$th] ?? 0) / $goodsYear[$th] * 100, 2) : null,
            ]);

        // Biaya (non-pajak) per PENYEDIA JASA — vendor di faktur biaya (forwarder, DJBC, dll).
        $byVendor = $base()
            ->whereRaw("{$catExpr} <> 'Pajak (PPN/PPh)'")
            ->groupBy('e.vendor_name')
            ->selectRaw("e.vendor_name, SUM({$idrExpr}) AS idr, COUNT(*) AS n")
            ->orderByDesc('idr')->limit(15)->get()
            ->map(fn ($r) => ['vendor' => $r->vendor_name, 'idr' => (float) $r->idr, 'n' => (int) $r->n]);

        // Biaya per PO — ekstrak ref PO dari catatan (satu catatan bisa menyebut beberapa PO:
        // nilai dibagi rata). Principal barang dari mapping vendor faktur ber-PO tsb.
        $expRows = $base()
            ->whereRaw("{$catExpr} <> 'Pajak (PPN/PPh)'")
            ->selectRaw("e.notes, {$idrExpr} AS idr")
            ->get();
        $poCost = [];
        foreach ($expRows as $r) {
            if (! preg_match_all('/PO[\/-][A-Z]{0,4}\/?\d{4}\/\d{4,6}/i', (string) $r->notes, $mm)) {
                continue;
            }
            $refs = array_unique(array_map('strtoupper', $mm[0]));
            foreach ($refs as $ref) {
                $poCost[$ref] = ($poCost[$ref] ?? 0) + (float) $r->idr / count($refs);
            }
        }
        arsort($poCost);
        $topPoRefs = array_slice(array_keys($poCost), 0, 15);
        $poPrincipal = DB::table('dwh_stg_acc_purchase_invoice_item as s')
            ->leftJoin('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 's.vendor_name')
            ->leftJoin('pricing_principals as p', 'p.id', '=', 'm.principal_id')
            ->whereIn('s.po_number', $topPoRefs)
            ->groupBy('s.po_number')
            ->selectRaw('s.po_number, MAX(COALESCE(p.name, s.vendor_name)) AS principal')
            ->pluck('principal', 's.po_number');
        $topPo = collect($topPoRefs)->map(fn ($ref) => [
            'po' => $ref,
            'principal' => $poPrincipal[$ref] ?? null,
            'idr' => round($poCost[$ref], 0),
        ]);

        return [
            'by_category' => $byCategory->values(),
            'by_account' => $byAccount->values(),
            'by_year' => $byYear->values(),
            'by_vendor' => $byVendor->values(),
            'top_po' => $topPo->values(),
            'import_goods_idr' => $importGoods,
            'cost_idr' => $costNonTax,
            'cost_with_tax_idr' => (float) $byCategory->sum('idr'),
            'rate_pct' => $importGoods > 0 ? round($costNonTax / $importGoods * 100, 2) : null,
        ];
    }

    /**
     * Biaya impor PER PO: nilai barang PO (realisasi faktur, IDR) vs total biaya terkait
     * (dari ref PO di catatan biaya; catatan multi-PO dibagi rata; pajak dipisah) → rate
     * per PO. Baris biaya tanpa ref PO dilaporkan terpisah agar total tetap tie-back.
     * Filter principal/tahun/cari dilakukan di sisi klien (data dikirim utuh sekali).
     */
    public function importPoCosts(): \Illuminate\Http\JsonResponse
    {
        $catExpr = $this->expCatExpr();
        $idrExpr = $this->expIdrExpr();

        $exp = DB::table('dwh_stg_acc_purchase_expense as e')
            ->leftJoin('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 'e.vendor_name')
            ->leftJoin('dwh_fx_rate as fx', function ($j) {
                $j->on('fx.currency', '=', 'm.default_currency')->on('fx.period', '=', DB::raw('LEFT(e.trans_date, 7)'));
            })
            ->whereNotNull('e.trans_date')
            ->selectRaw("e.notes, {$idrExpr} AS idr, ({$catExpr} = 'Pajak (PPN/PPh)') AS is_tax")
            ->get();

        // Peta normalisasi ref: catatan biaya sering salah tulis (kelebihan nol, tanpa segmen
        // "I") — cocokkan by (bulan yymm + nomor urut) ke ref PO yang benar-benar ada.
        $canon = function (string $ref): ?string {
            return preg_match('/(\d{4})\/(\d+)\s*$/', $ref, $m) ? $m[1].'|'.(int) $m[2] : null;
        };
        $canonMap = [];
        $knownRefs = DB::table('dwh_stg_acc_purchase_invoice_item')->whereNotNull('po_number')->where('po_number', '<>', '')->distinct()->pluck('po_number')
            ->merge(DB::table('dwh_stg_acc_purchase_order')->pluck('number'))
            ->unique();
        foreach ($knownRefs as $kr) {
            if ($k = $canon($kr)) {
                $canonMap[$k] = strtoupper($kr);
            }
        }

        $cost = [];
        $tax = [];
        $nCost = [];
        $unattr = ['cost' => 0.0, 'tax' => 0.0, 'n' => 0];
        foreach ($exp as $r) {
            if (preg_match_all('/PO[\/-][A-Z]{0,4}\/?\d{4}\/\d{4,6}/i', (string) $r->notes, $mm)) {
                $refs = array_unique(array_map(
                    fn ($x) => $canonMap[$canon($x) ?? ''] ?? strtoupper($x),
                    $mm[0]
                ));
                foreach ($refs as $ref) {
                    $bag = $r->is_tax ? 'tax' : 'cost';
                    ${$bag}[$ref] = (${$bag}[$ref] ?? 0) + (float) $r->idr / count($refs);
                    if (! $r->is_tax) {
                        $nCost[$ref] = ($nCost[$ref] ?? 0) + 1;
                    }
                }
            } else {
                $unattr[$r->is_tax ? 'tax' : 'cost'] += (float) $r->idr;
                $unattr['n']++;
            }
        }

        // Vendor rantai impor via agen (mis. Asia Actual utk Globus): faktur IDR + fee sehingga
        // tak ada baris biaya terpisah, tapi PO ERP-nya valas → tetap dihitung principal impor.
        $agentNorms = [];
        try {
            $p = config('erp.prefix');
            $agentNorms = array_map(fn ($r) => $r->n, DB::connection(config('erp.connection'))->select(
                'SELECT DISTINCT '.$this->normSqlErp('so.nom')." AS n
                 FROM {$p}commande_fournisseur c
                 JOIN {$p}societe so ON so.rowid = c.fk_soc
                 WHERE c.fk_statut IN (2,3,4,5) AND COALESCE(NULLIF(c.multicurrency_code,''),'IDR') <> 'IDR'"));
        } catch (\Throwable) {
        }

        // Nilai barang per PO (realisasi faktur) + principal + penanda impor (vendor valas).
        $goods = DB::table('dwh_stg_acc_purchase_invoice_item as s')
            ->leftJoin('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 's.vendor_name')
            ->leftJoin('pricing_principals as p', 'p.id', '=', 'm.principal_id')
            ->leftJoin('dwh_fx_rate as fx', function ($j) {
                $j->on('fx.currency', '=', 's.currency_code')->on('fx.period', '=', DB::raw('LEFT(s.trans_date, 7)'));
            })
            ->whereNotNull('s.po_number')->where('s.po_number', '<>', '')
            ->groupBy('s.po_number')
            ->selectRaw("s.po_number, MAX(COALESCE(p.name, s.vendor_name)) AS principal,
                MAX(s.vendor_name) AS vendor_name,
                MIN(s.trans_date) AS tanggal, SUM(".$this->idrExpr().") AS goods,
                MAX(m.default_currency <> 'IDR') AS is_import")
            ->get()
            ->each(function ($g) use ($agentNorms) {
                if (! $g->is_import && in_array($this->norm($g->vendor_name), $agentNorms, true)) {
                    $g->is_import = 1; // rantai impor via agen (PO ERP valas)
                }
            })
            ->keyBy('po_number');

        $refs = collect(array_keys($cost))->merge(array_keys($tax))->merge($goods->keys())->unique();

        // Fallback principal utk ref PO yang realisasi fakturnya belum ada di staging:
        // ambil dari PO Accurate (vendor transaksi) + mapping — supaya principal transaksi
        // tetap muncul di daftar, bukan jatuh ke "(tak dikenal)".
        $accPo = DB::table('dwh_stg_acc_purchase_order as o')
            ->leftJoin('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 'o.vendor_name')
            ->leftJoin('pricing_principals as p', 'p.id', '=', 'm.principal_id')
            ->whereIn('o.number', $refs->diff($goods->keys())->values()->all())
            ->selectRaw("o.number, COALESCE(p.name, o.vendor_name) AS principal, o.trans_date,
                (COALESCE(m.default_currency,'IDR') <> 'IDR' OR COALESCE(o.currency_code,'IDR') <> 'IDR') AS is_import")
            ->get()->keyBy('number');

        $rows = $refs->map(function ($ref) use ($cost, $tax, $nCost, $goods, $accPo) {
            $g = $goods[$ref] ?? null;
            $a = $accPo[$ref] ?? null;
            $c = (float) ($cost[$ref] ?? 0);
            $isImport = $g ? (bool) $g->is_import : ($a ? (bool) $a->is_import || $c >= 1 : true);
            if (! $isImport && $c < 1) {
                return null; // PO lokal tanpa biaya impor — di luar cakupan tab ini.
            }

            return [
                'po' => $ref,
                'principal' => $g->principal ?? $a->principal ?? null,
                'tanggal' => $g->tanggal ?? $a->trans_date ?? null,
                'goods' => $g ? round((float) $g->goods) : 0,
                'cost' => round($c),
                'tax' => round((float) ($tax[$ref] ?? 0)),
                'n_cost' => (int) ($nCost[$ref] ?? 0),
                // Rate hanya bila ada biaya teralokasi — impor via agen (biaya melekat di harga
                // faktur, mis. Asia Actual) tampil "–", bukan 0% yang menyesatkan.
                'rate_pct' => $c >= 1 && $g && (float) $g->goods > 0 ? round($c / (float) $g->goods * 100, 2) : null,
            ];
        })->filter()->sortByDesc('cost')->values();

        return response()->json([
            'rows' => $rows,
            'unattributed' => ['cost' => round($unattr['cost']), 'tax' => round($unattr['tax']), 'n' => $unattr['n']],
        ]);
    }

    /**
     * Drill baris biaya impor: daftar mentah dgn filter kategori/akun/vendor/tahun + cari.
     * Untuk menelusuri angka mana pun di tab Analisa Biaya Impor sampai ke dokumennya.
     */
    public function importCostDetail(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'year' => ['nullable', 'regex:/^\d{4}$/'],
            'kategori' => ['nullable', 'string', 'max:64'],
            'account_no' => ['nullable', 'string', 'max:32'],
            'vendor' => ['nullable', 'string', 'max:255'],
            'q' => ['nullable', 'string', 'max:255'],
        ]);
        $catExpr = $this->expCatExpr();
        $idrExpr = $this->expIdrExpr();

        $rows = DB::table('dwh_stg_acc_purchase_expense as e')
            ->leftJoin('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 'e.vendor_name')
            ->leftJoin('dwh_fx_rate as fx', function ($j) {
                $j->on('fx.currency', '=', 'm.default_currency')->on('fx.period', '=', DB::raw('LEFT(e.trans_date, 7)'));
            })
            ->whereNotNull('e.trans_date')
            ->when($data['year'] ?? null, fn ($q2, $y) => $q2->whereRaw('LEFT(e.trans_date,4) = ?', [$y]))
            ->when($data['kategori'] ?? null, fn ($q2, $k) => $q2->whereRaw("{$catExpr} = ?", [$k]))
            ->when($data['account_no'] ?? null, fn ($q2, $a) => $q2->where('e.account_no', $a))
            ->when($data['vendor'] ?? null, fn ($q2, $v) => $q2->where('e.vendor_name', $v))
            ->when($data['q'] ?? null, fn ($q2, $s) => $q2->where(fn ($w) => $w
                ->where('e.doc_number', 'like', "%{$s}%")
                ->orWhere('e.notes', 'like', "%{$s}%")
                ->orWhere('e.vendor_name', 'like', "%{$s}%")))
            ->selectRaw("e.doc_number, e.trans_date, e.vendor_name, e.account_no, e.account_name,
                e.notes, e.amount, {$catExpr} AS kategori, {$idrExpr} AS idr")
            ->orderByDesc(DB::raw("ABS({$idrExpr})"))
            ->limit(500)
            ->get()
            ->map(fn ($r) => [
                'doc_number' => $r->doc_number, 'trans_date' => $r->trans_date, 'vendor' => $r->vendor_name,
                'account' => trim(($r->account_no ?? '').' '.($r->account_name ?? '')),
                'notes' => mb_substr(trim(preg_replace('/\s+/', ' ', (string) $r->notes)), 0, 160),
                'kategori' => $r->kategori, 'amount' => (float) $r->amount, 'idr' => (float) $r->idr,
            ]);

        return response()->json(['rows' => $rows]);
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

    /**
     * Pivot ringkasan pembelian: baris = tahun (atau bulan bila `year` diisi), kolom = mata
     * uang, nilai = SUM nilai ASLI (bukan IDR) — meniru pivot Excel user. Filter principal
     * opsional (dari klik bar chart).
     */
    public function spendPivot(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'principal' => ['nullable', 'string', 'max:255'],
            'year' => ['nullable', 'regex:/^\d{4}$/'],
        ]);
        $year = $data['year'] ?? null;
        $periodExpr = $year ? 'MONTH(s.trans_date)' : 'LEFT(s.trans_date,4)';

        $rows = DB::table('dwh_stg_acc_purchase_invoice_item as s')
            ->leftJoin('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 's.vendor_name')
            ->leftJoin('pricing_principals as p', 'p.id', '=', 'm.principal_id')
            ->whereNotNull('s.trans_date')
            ->when($year, fn ($q) => $q->whereRaw('LEFT(s.trans_date,4) = ?', [$year]))
            ->when($data['principal'] ?? null, fn ($q, $pr) => $q->whereRaw('COALESCE(p.name, s.vendor_name) = ?', [$pr]))
            ->groupBy('period', 'cur')
            ->selectRaw("{$periodExpr} AS period, COALESCE(s.currency_code,'IDR') AS cur,
                SUM(s.total) AS total, COUNT(DISTINCT s.doc_number) AS docs")
            ->orderBy('period')
            ->get();

        // Susun pivot: IDR selalu kolom pertama, sisanya urut abjad; mata uang yang
        // totalnya 0 (dokumen tanpa nilai) tidak dijadikan kolom.
        $curSums = $rows->groupBy('cur')->map(fn ($g) => $g->sum('total'));
        $curs = $rows->pluck('cur')->unique()
            ->filter(fn ($c) => abs($curSums[$c] ?? 0) > 0.005)
            ->sort()->sortBy(fn ($c) => $c === 'IDR' ? 0 : 1)->values();
        $periods = [];
        $totals = [];
        foreach ($rows as $r) {
            $periods[$r->period]['period'] = (string) $r->period;
            $periods[$r->period]['cells'][$r->cur] = (float) $r->total;
            $periods[$r->period]['docs'] = ($periods[$r->period]['docs'] ?? 0) + (int) $r->docs;
            $totals[$r->cur] = ($totals[$r->cur] ?? 0) + (float) $r->total;
        }

        return response()->json([
            'mode' => $year ? 'month' : 'year',
            'currencies' => $curs,
            'rows' => array_values($periods),
            'totals' => $totals,
        ]);
    }

    /**
     * Drill saldo vendor: faktur OUTSTANDING per vendor, live dari Accurate
     * (filter.vendorId + filter.outstanding=true), plus sisa tagihan per faktur
     * (owing dari detail — dipanggil per faktur, dibatasi 30) dan telat hari.
     * Vendor bersaldo kredit biasanya tanpa faktur outstanding — saldo berasal
     * dari uang muka / CN / kelebihan bayar.
     */
    public function apDrill(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate(['vendor_id' => ['required', 'integer']]);

        try {
            $s = AccurateSetting::current();
            $acc = app(AccurateService::class);
            $rows = [];
            $page = 1;
            do {
                $l = $acc->apiGet($s, 'purchase-invoice/list.do', [
                    'fields' => 'id,number,billNumber,transDate,dueDate,totalAmount',
                    'filter.vendorId' => $data['vendor_id'],
                    'filter.outstanding' => 'true',
                    'sp.pageSize' => 100, 'sp.page' => $page,
                ]);
                foreach ($l['d'] ?? [] as $r) {
                    $rows[] = $r;
                }
                $pc = $l['sp']['pageCount'] ?? 1;
                $page++;
            } while ($page <= $pc && count($rows) < 300);

            $out = [];
            foreach ($rows as $i => $r) {
                $owing = null;
                if ($i < 30) {
                    try {
                        $d = $acc->apiGet($s, 'purchase-invoice/detail.do', ['id' => $r['id']])['d'] ?? [];
                        $owing = (float) ($d['primeOwing'] ?? $d['owing'] ?? 0) ?: null;
                    } catch (\Throwable) {
                    }
                }
                $due = isset($r['dueDate']) ? \Illuminate\Support\Carbon::createFromFormat('d/m/Y', $r['dueDate']) : null;
                $out[] = [
                    'number' => $r['number'] ?? null,
                    'bill_number' => $r['billNumber'] ?? null,
                    'trans_date' => isset($r['transDate']) ? \Illuminate\Support\Carbon::createFromFormat('d/m/Y', $r['transDate'])->toDateString() : null,
                    'due_date' => $due?->toDateString(),
                    'total' => (float) ($r['totalAmount'] ?? 0),
                    'owing' => $owing,
                    'overdue' => $due ? (int) $due->diffInDays(now(), false) : null,
                ];
            }
            usort($out, fn ($a, $b) => ($b['overdue'] ?? -9999) <=> ($a['overdue'] ?? -9999));

            return response()->json(['available' => true, 'rows' => $out]);
        } catch (\Throwable $e) {
            return response()->json(['available' => false, 'error' => mb_substr($e->getMessage(), 0, 150), 'rows' => []]);
        }
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

    /** Versi SQL dari norm() — harus identik dengan norm() dan normSql PurchaseMonitorController. */
    protected function normSqlErp(string $col): string
    {
        return "REPLACE(REPLACE(REPLACE(REPLACE(LOWER($col),' ',''),'.',''),',',''),'pt','')";
    }
}
