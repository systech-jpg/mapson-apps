<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SalesFact;
use App\Services\Dwh\CostAllocationService;
use App\Services\Erp\ErpStockSyncService;
use App\Services\Erp\WarehouseActivityService;
use App\Support\InventorySnapshot;
use App\Support\SalesDimensions as SD;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function index(Request $request): Response
    {
        $years = SalesFact::query()
            ->whereNotNull('tahun')->where('tahun', '!=', '')
            ->distinct()->orderByDesc('tahun')->pluck('tahun')->values();

        $year = (string) ($request->input('year') ?: ($years->first() ?? date('Y')));
        $prevYear = (string) ((int) $year - 1);

        $yearScope = fn () => SalesFact::query()->where('tahun', $year);

        // --- KPI (tahun terpilih) ---
        $dpp = (float) $yearScope()->sum('dpp');
        $ttc = (float) $yearScope()->sum('total');
        $ppn = (float) $yearScope()->sum('ppn');
        $invoices = (int) $yearScope()->distinct()->count('invoice_no');
        $customers = (int) $yearScope()->distinct()->count('customer');
        $discount = (float) $yearScope()->sum('disc_value');
        $prevDpp = (float) SalesFact::where('tahun', $prevYear)->sum('dpp');
        $yoy = $prevDpp > 0 ? round(($dpp - $prevDpp) / $prevDpp * 100, 1) : null;

        // --- Piutang (seluruh periode = saldo AR) ---
        $paidTotal = (float) SalesFact::where('paid_unpaid', 'PAID')->sum('total');
        $outstanding = (float) SalesFact::where('paid_unpaid', 'UNPAID')->sum('total');
        $collectionRate = ($paidTotal + $outstanding) > 0 ? round($paidTotal / ($paidTotal + $outstanding) * 100, 1) : 0;

        // --- Tren bulanan (tahun terpilih vs tahun sebelumnya), basis DPP ---
        $monthlyRaw = SalesFact::query()
            ->selectRaw('tahun, MONTH(invoice_date) AS m, SUM(dpp) AS s')
            ->whereIn('tahun', [$year, $prevYear])
            ->whereNotNull('invoice_date')
            ->groupBy('tahun', 'm')
            ->get();

        $names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        $trend = [];
        for ($m = 1; $m <= 12; $m++) {
            $trend[] = [
                'month' => $names[$m - 1],
                'current' => (float) ($monthlyRaw->first(fn ($r) => $r->tahun == $year && $r->m == $m)->s ?? 0),
                'previous' => (float) ($monthlyRaw->first(fn ($r) => $r->tahun == $prevYear && $r->m == $m)->s ?? 0),
            ];
        }

        // --- Growth MoM (dari seluruh data, 2 bulan terakhir yang ada) ---
        $monthlySeries = SalesFact::query()
            ->selectRaw("DATE_FORMAT(invoice_date, '%Y-%m') AS ym, SUM(dpp) AS s")
            ->whereNotNull('invoice_date')
            ->groupBy('ym')->orderBy('ym')->pluck('s', 'ym');
        // Pertumbuhan: bulan PENUH terakhir vs sebelumnya — lewati bulan berjalan yang belum genap.
        $keys = $monthlySeries->keys()->values();
        if ($keys->isNotEmpty() && $keys->last() === now()->format('Y-m')) {
            $keys = $keys->slice(0, -1)->values();
        }
        $mom = null;
        $momCompare = null;
        if ($keys->count() >= 2) {
            $lastKey = (string) $keys->last();
            $prevKey = (string) $keys[$keys->count() - 2];
            $lastVal = (float) $monthlySeries[$lastKey];
            $prevVal = (float) $monthlySeries[$prevKey];
            $mom = $prevVal > 0 ? round(($lastVal - $prevVal) / $prevVal * 100, 1) : null;
            $momCompare = [
                'last' => ['ym' => $lastKey, 'value' => $lastVal],
                'prev' => ['ym' => $prevKey, 'value' => $prevVal],
            ];
        }

        // --- Breakdown Top-N (tahun terpilih, basis DPP) ---
        $topBy = fn (string $col) => $yearScope()
            ->whereNotNull($col)->where($col, '!=', '')
            ->selectRaw("$col AS label, SUM(dpp) AS value")
            ->groupBy($col)->orderByDesc('value')->limit(8)
            ->get()->map(fn ($r) => ['label' => $r->label, 'value' => (float) $r->value])->values();

        // --- Aging piutang (seluruh UNPAID) ---
        $aging = SalesFact::query()->where('paid_unpaid', 'UNPAID')->selectRaw("
            SUM(CASE WHEN due_date IS NULL OR due_date >= CURDATE() THEN total ELSE 0 END) AS belum,
            SUM(CASE WHEN due_date < CURDATE() AND DATEDIFF(CURDATE(), due_date) BETWEEN 1 AND 30 THEN total ELSE 0 END) AS d1_30,
            SUM(CASE WHEN due_date < CURDATE() AND DATEDIFF(CURDATE(), due_date) BETWEEN 31 AND 60 THEN total ELSE 0 END) AS d31_60,
            SUM(CASE WHEN due_date < CURDATE() AND DATEDIFF(CURDATE(), due_date) BETWEEN 61 AND 90 THEN total ELSE 0 END) AS d61_90,
            SUM(CASE WHEN due_date < CURDATE() AND DATEDIFF(CURDATE(), due_date) > 90 THEN total ELSE 0 END) AS d90p
        ")->first();

        return Inertia::render('dashboard', [
            'years' => $years,
            'year' => $year,
            'hasData' => SalesFact::query()->exists(),
            'kpi' => [
                'dpp' => $dpp,
                'ttc' => $ttc,
                'ppn' => $ppn,
                'invoices' => $invoices,
                'customers' => $customers,
                'discount' => $discount,
                'aov' => $invoices > 0 ? $dpp / $invoices : 0,
                'yoy' => $yoy,
                'mom' => $mom,
                'momCompare' => $momCompare,
            ],
            'ar' => [
                'paid' => $paidTotal,
                'outstanding' => $outstanding,
                'collectionRate' => $collectionRate,
                'aging' => [
                    ['label' => 'Belum jatuh tempo', 'value' => (float) ($aging->belum ?? 0)],
                    ['label' => '1–30 hari', 'value' => (float) ($aging->d1_30 ?? 0)],
                    ['label' => '31–60 hari', 'value' => (float) ($aging->d31_60 ?? 0)],
                    ['label' => '61–90 hari', 'value' => (float) ($aging->d61_90 ?? 0)],
                    ['label' => '> 90 hari', 'value' => (float) ($aging->d90p ?? 0)],
                ],
            ],
            'trend' => $trend,
            'prevYear' => $prevYear,
            'topCustomers' => $topBy('customer'),
            'topRegions' => $topBy('region'),
            'topMerk' => $topBy('merk'),
        ]);
    }

    /** Finance section (top-menu) — receivables / collection / tax from ERP. */
    public function finance(Request $request): Response
    {
        $names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

        $years = SalesFact::query()
            ->whereNotNull('tahun')->where('tahun', '!=', '')
            ->distinct()->orderByDesc('tahun')->pluck('tahun')->values();
        $year = (string) ($request->input('year') ?: ($years->first() ?? date('Y')));

        // Semua metrik discope ke invoice tahun terpilih (mirror dashboard Sales).
        $scope = fn () => SalesFact::query()->where('tahun', $year);

        $paidTotal = (float) $scope()->where('paid_unpaid', 'PAID')->sum('total');
        $outstanding = (float) $scope()->where('paid_unpaid', 'UNPAID')->sum('total');
        $collectionRate = ($paidTotal + $outstanding) > 0 ? round($paidTotal / ($paidTotal + $outstanding) * 100, 1) : 0;

        // Volume tagihan tahun terpilih.
        $invoices = (int) $scope()->distinct()->count('invoice_no');
        $dppTotal = (float) $scope()->sum('dpp');
        $aov = $invoices > 0 ? $dppTotal / $invoices : 0;

        // Overdue (lewat jatuh tempo) & DSO.
        $overdue = (float) $scope()->where('paid_unpaid', 'UNPAID')->whereRaw('due_date < CURDATE()')->sum('total');
        $overduePct = $outstanding > 0 ? round($overdue / $outstanding * 100, 1) : 0;
        $dso = (float) $scope()->where('paid_unpaid', 'PAID')
            ->whereNotNull('payment_date')->whereNotNull('invoice_date')
            ->selectRaw('AVG(DATEDIFF(payment_date, invoice_date)) d')->value('d');

        // PPN keluaran tahun terpilih.
        $ppnYtd = (float) $scope()->sum('ppn');

        // Aging piutang (backward — sudah/belum lewat tempo).
        $aging = $scope()->where('paid_unpaid', 'UNPAID')->selectRaw("
            SUM(CASE WHEN due_date IS NULL OR due_date >= CURDATE() THEN total ELSE 0 END) AS belum,
            SUM(CASE WHEN due_date < CURDATE() AND DATEDIFF(CURDATE(), due_date) BETWEEN 1 AND 30 THEN total ELSE 0 END) AS d1_30,
            SUM(CASE WHEN due_date < CURDATE() AND DATEDIFF(CURDATE(), due_date) BETWEEN 31 AND 60 THEN total ELSE 0 END) AS d31_60,
            SUM(CASE WHEN due_date < CURDATE() AND DATEDIFF(CURDATE(), due_date) BETWEEN 61 AND 90 THEN total ELSE 0 END) AS d61_90,
            SUM(CASE WHEN due_date < CURDATE() AND DATEDIFF(CURDATE(), due_date) > 90 THEN total ELSE 0 END) AS d90p
        ")->first();

        // Proyeksi jatuh tempo (forward — kapan piutang jatuh tempo ke depan).
        $fc = $scope()->where('paid_unpaid', 'UNPAID')->selectRaw('
            SUM(CASE WHEN due_date < CURDATE() THEN total ELSE 0 END) AS overdue,
            SUM(CASE WHEN due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN total ELSE 0 END) AS d0_30,
            SUM(CASE WHEN due_date BETWEEN DATE_ADD(CURDATE(), INTERVAL 31 DAY) AND DATE_ADD(CURDATE(), INTERVAL 60 DAY) THEN total ELSE 0 END) AS d31_60,
            SUM(CASE WHEN due_date BETWEEN DATE_ADD(CURDATE(), INTERVAL 61 DAY) AND DATE_ADD(CURDATE(), INTERVAL 90 DAY) THEN total ELSE 0 END) AS d61_90,
            SUM(CASE WHEN due_date > DATE_ADD(CURDATE(), INTERVAL 90 DAY) THEN total ELSE 0 END) AS d90p
        ')->first();

        // Top debtor + aging per customer.
        $topDebtors = $scope()->where('paid_unpaid', 'UNPAID')
            ->whereNotNull('customer')->where('customer', '!=', '')
            ->selectRaw("
                customer,
                SUM(total) AS outstanding,
                SUM(CASE WHEN due_date < CURDATE() THEN total ELSE 0 END) AS overdue,
                MAX(CASE WHEN due_date < CURDATE() THEN DATEDIFF(CURDATE(), due_date) ELSE 0 END) AS oldest
            ")
            ->groupBy('customer')->orderByDesc('outstanding')->limit(15)
            ->get()
            ->map(fn ($r) => [
                'customer' => (string) $r->customer,
                'outstanding' => (float) $r->outstanding,
                'overdue' => (float) $r->overdue,
                'oldest' => (int) $r->oldest,
            ])->values();

        // Tren: tertagih (payment_date) vs tagihan (invoice_date) per bulan, tahun terpilih.
        $invByMonth = $scope()->whereNotNull('invoice_date')
            ->selectRaw('MONTH(invoice_date) m, SUM(total) s')->groupBy('m')->pluck('s', 'm');
        $colByMonth = $scope()->where('paid_unpaid', 'PAID')->whereNotNull('payment_date')
            ->selectRaw('MONTH(payment_date) m, SUM(total) s')->groupBy('m')->pluck('s', 'm');
        $trend = [];
        for ($m = 1; $m <= 12; $m++) {
            $trend[] = [
                'month' => $names[$m - 1],
                'invoiced' => (float) ($invByMonth[$m] ?? 0),
                'collected' => (float) ($colByMonth[$m] ?? 0),
            ];
        }

        // Analisa termin: komposisi piutang per termin + rasio bayar tepat waktu.
        $terminComposition = $scope()->where('paid_unpaid', 'UNPAID')
            ->whereNotNull('tempo')->where('tempo', '!=', '')
            ->selectRaw('tempo AS label, SUM(total) AS value')
            ->groupBy('tempo')->orderByDesc('value')->limit(8)
            ->get()->map(fn ($r) => ['label' => (string) $r->label, 'value' => (float) $r->value])->values();
        $paidWithDates = (int) $scope()->where('paid_unpaid', 'PAID')->whereNotNull('payment_date')->whereNotNull('due_date')->count();
        $onTime = (int) $scope()->where('paid_unpaid', 'PAID')->whereNotNull('payment_date')->whereNotNull('due_date')
            ->whereRaw('payment_date <= due_date')->count();
        $onTimeRate = $paidWithDates > 0 ? round($onTime / $paidWithDates * 100, 1) : null;

        // PPN keluaran per bulan (tahun terpilih).
        $ppnByMonth = $scope()->whereNotNull('invoice_date')
            ->selectRaw('MONTH(invoice_date) m, SUM(ppn) s')->groupBy('m')->pluck('s', 'm');
        $ppnTrend = [];
        for ($m = 1; $m <= 12; $m++) {
            $ppnTrend[] = ['month' => $names[$m - 1], 'value' => (float) ($ppnByMonth[$m] ?? 0)];
        }

        return Inertia::render('dashboard/finance', [
            'hasData' => SalesFact::query()->exists(),
            'years' => $years,
            'year' => $year,
            'kpi' => [
                'invoices' => $invoices,
                'aov' => $aov,
                'overdue' => $overdue,
                'overduePct' => $overduePct,
                'dso' => $dso !== null ? round($dso, 1) : null,
                'ppnYtd' => $ppnYtd,
            ],
            'ar' => [
                'paid' => $paidTotal,
                'outstanding' => $outstanding,
                'collectionRate' => $collectionRate,
                'aging' => [
                    ['label' => 'Belum jatuh tempo', 'value' => (float) ($aging->belum ?? 0)],
                    ['label' => '1–30 hari', 'value' => (float) ($aging->d1_30 ?? 0)],
                    ['label' => '31–60 hari', 'value' => (float) ($aging->d31_60 ?? 0)],
                    ['label' => '61–90 hari', 'value' => (float) ($aging->d61_90 ?? 0)],
                    ['label' => '> 90 hari', 'value' => (float) ($aging->d90p ?? 0)],
                ],
            ],
            'forecast' => [
                ['label' => 'Sudah lewat tempo', 'value' => (float) ($fc->overdue ?? 0)],
                ['label' => '≤ 30 hari lagi', 'value' => (float) ($fc->d0_30 ?? 0)],
                ['label' => '31–60 hari lagi', 'value' => (float) ($fc->d31_60 ?? 0)],
                ['label' => '61–90 hari lagi', 'value' => (float) ($fc->d61_90 ?? 0)],
                ['label' => '> 90 hari lagi', 'value' => (float) ($fc->d90p ?? 0)],
            ],
            'topDebtors' => $topDebtors,
            'trend' => $trend,
            'termin' => [
                'composition' => $terminComposition,
                'onTimeRate' => $onTimeRate,
                'paidWithDates' => $paidWithDates,
            ],
            'ppnTrend' => $ppnTrend,
        ]);
    }

    /**
     * Stock section (top-menu) — persediaan (snapshot ERP) + aktivitas pengiriman gudang.
     *
     * CATATAN JUJUR: nilai persediaan pada HPP TIDAK ditampilkan karena datanya belum ada.
     * `unit_price` Accurate = harga JUAL, bukan HPP; HPP dari faktur pembelian belum dibangun.
     * Lebih baik tidak menampilkan angka daripada menampilkan angka yang salah.
     */
    public function stock(Request $request, WarehouseActivityService $wa): Response
    {
        $view = $request->input('view') === 'gudang' ? 'gudang' : 'persediaan';
        $dead = (int) ($request->input('dead') ?: 180);
        $dead = in_array($dead, [90, 180, 365], true) ? $dead : 180;

        if ($view === 'gudang') {
            $range = $wa->range();
            $to = (string) ($request->input('to') ?: ($range['max'] ?? now()->toDateString()));
            $from = (string) ($request->input('from') ?: Carbon::parse($to)->subMonths(6)->startOfMonth()->toDateString());

            return Inertia::render('dashboard/stock', [
                'view' => $view, 'dead' => $dead,
                'hasStock' => InventorySnapshot::latestDate(InventorySnapshot::ERP) !== null,
                'gudang' => [
                    'from' => $from, 'to' => $to, 'range' => $range,
                    'summary' => $wa->summary($from, $to),
                    // Pengiriman dihitung terpisah: dari tindakan langsung & basis tanggal
                    // KIRIM — sebab 129 tindakan tak punya usage report (116 di antaranya
                    // tetap punya surat jalan) dan tanggal kirim ≠ tanggal tindakan.
                    'kirim' => $wa->shipmentSummary($from, $to),
                    'kirimByMonth' => $wa->shipmentsByMonth($from, $to),
                    // Ritase = beban trip kendaraan: DO ×1, tindakan ×2 (kirim + tarik alat).
                    'ritase' => $wa->ritaseSummary($from, $to),
                    'ritaseByMonth' => $wa->ritaseByMonth($from, $to),
                    'byMonth' => $wa->byMonth($from, $to),
                    'byHospital' => $wa->byHospital($from, $to),
                    'deadWeight' => $wa->deadWeight($from, $to),
                    'topUsed' => $wa->topUsed($from, $to),
                ],
                'stok' => null,
            ]);
        }

        $snapDate = InventorySnapshot::latestDate(InventorySnapshot::ERP);
        if ($snapDate === null) {
            return Inertia::render('dashboard/stock', [
                'view' => $view, 'dead' => $dead, 'hasStock' => false, 'stok' => null, 'gudang' => null,
            ]);
        }

        // Terakhir terjual per part_number — riwayat penjualan penuh (2021→), bukan
        // hanya jendela mutasi yang pendek.
        $lastSold = DB::table('sales_facts')
            ->selectRaw('part_number, MAX(invoice_date) last_sold, SUM(quantity) qty_total')
            ->whereNotNull('part_number')->where('part_number', '!=', '')
            ->groupBy('part_number');

        $base = fn () => DB::query()
            ->fromSub(InventorySnapshot::erp(), 'e')
            ->leftJoinSub($lastSold, 's', 's.part_number', '=', 'e.ref');

        $batas = now()->subDays($dead)->toDateString();

        // "Menipis" = masih ada stok tapi di bawah buffer (qty > 0). Item qty = 0
        // dihitung sebagai "habis", bukan menipis — supaya tidak dobel & konsisten
        // dengan kolom status di tabel Stok Saat Ini.
        $kpi = $base()->selectRaw('
            COUNT(*) sku,
            SUM(e.qty > 0) bersaldo,
            SUM(e.qty = 0) habis,
            SUM(e.qty > 0 AND e.buffer > 0 AND e.qty < e.buffer) low,
            SUM(e.qty > 0 AND (s.last_sold IS NULL OR s.last_sold < ?)) dead,
            SUM(e.qty) qty_total
        ', [$batas])->first();

        $lowStock = $base()
            ->whereRaw('e.qty > 0 AND e.buffer > 0 AND e.qty < e.buffer')
            ->selectRaw('e.ref, e.label, e.principal, e.category_l2, e.qty, e.buffer, (e.buffer - e.qty) kurang, s.last_sold')
            ->orderByRaw('(e.buffer - e.qty) DESC')->limit(20)->get()
            ->map(fn ($r) => [
                'ref' => $r->ref, 'label' => $r->label, 'principal' => $r->principal,
                'qty' => (float) $r->qty, 'buffer' => (float) $r->buffer, 'kurang' => (float) $r->kurang,
                'lastSold' => $r->last_sold,
            ])->values();

        $deadStock = $base()
            ->whereRaw('e.qty > 0 AND (s.last_sold IS NULL OR s.last_sold < ?)', [$batas])
            ->selectRaw('e.ref, e.label, e.principal, e.qty, s.last_sold,
                DATEDIFF(CURDATE(), s.last_sold) umur')
            ->orderByRaw('e.qty DESC')->limit(20)->get()
            ->map(fn ($r) => [
                'ref' => $r->ref, 'label' => $r->label, 'principal' => $r->principal,
                'qty' => (float) $r->qty, 'lastSold' => $r->last_sold, 'umur' => $r->umur === null ? null : (int) $r->umur,
            ])->values();

        // Stok saat ini + buffer (snapshot terakhir), termasuk qty = 0. Status dihitung
        // di sini agar bisa langsung diurutkan: yang di bawah buffer di atas.
        $stokList = $base()
            ->selectRaw('e.ref, e.label, e.principal, e.category_l2, e.qty, e.buffer,
                s.last_sold,
                CASE
                    WHEN e.qty = 0 THEN "habis"
                    WHEN e.buffer > 0 AND e.qty < e.buffer THEN "menipis"
                    ELSE "aman"
                END AS status')
            ->orderByRaw('e.qty = 0 DESC, (e.buffer > 0 AND e.qty < e.buffer) DESC, e.principal, e.label')
            ->limit(2000)->get()
            ->map(fn ($r) => [
                'ref' => $r->ref, 'label' => $r->label, 'principal' => $r->principal,
                'category' => $r->category_l2,
                'qty' => (float) $r->qty, 'buffer' => (float) $r->buffer,
                'status' => $r->status, 'lastSold' => $r->last_sold,
            ])->values();

        // Mutasi per bulan dari ERP (stock_mouvement Dolibarr). Default 12 bulan terakhir,
        // atau seluruh bulan sebuah tahun bila ?movyear= diisi.
        $movYear = $request->filled('movyear') ? (int) $request->input('movyear') : null;
        $mov = app(ErpStockSyncService::class)->movementsByMonth($movYear);

        return Inertia::render('dashboard/stock', [
            'view' => $view,
            'dead' => $dead,
            'hasStock' => true,
            'stok' => [
                'snapshotDate' => $snapDate,
                'snapshotDates' => count(InventorySnapshot::dates(InventorySnapshot::ERP)),
                'kpi' => [
                    'sku' => (int) $kpi->sku, 'bersaldo' => (int) $kpi->bersaldo, 'habis' => (int) $kpi->habis,
                    'low' => (int) $kpi->low, 'dead' => (int) $kpi->dead, 'qtyTotal' => (float) $kpi->qty_total,
                ],
                'list' => $stokList,
                'lowStock' => $lowStock,
                'deadStock' => $deadStock,
                'movement' => $mov['rows'],
                'movementMeta' => [
                    'from' => $mov['from'], 'to' => $mov['to'], 'rows' => $mov['total'],
                    'year' => $mov['year'], 'years' => $mov['years'],
                ],
            ],
            'gudang' => null,
        ]);
    }

    /**
     * Cost section (top-menu) — P&L dari Buku Besar yang diunggah (dwh_stg_gl) ⨝ COA.
     *
     * Struktur P&L datang dari `account_type` COA (REVENUE/COGS/EXPENSE/OTHER_*), jadi
     * tidak perlu pemetaan manual. Join memakai account_code — JANGAN nama akun, karena
     * satu nama bisa dipakai beberapa kode (mis. "Art 23" = 1172000 dan 2122000).
     */
    /** accountType COA yang membentuk laporan laba rugi. */
    protected const PL_TYPES = ['REVENUE', 'COGS', 'EXPENSE', 'OTHER_EXPENSE', 'OTHER_INCOME'];

    public function cost(Request $request, CostAllocationService $abc): Response
    {
        $periods = DB::table('dwh_stg_gl')->distinct()->orderByDesc('period')->pluck('period');
        $period = (string) ($request->input('period') ?: ($periods->first() ?? ''));
        $view = in_array($request->input('view'), ['banding', 'matriks', 'pool', 'produk'], true) ? $request->input('view') : 'ringkasan';

        if ($periods->isEmpty()) {
            return Inertia::render('dashboard/cost', [
                'hasData' => false, 'periods' => [], 'period' => null, 'view' => $view,
                'kpi' => null, 'sections' => [], 'topExpense' => [], 'groups' => [], 'trend' => [],
                'compare' => null, 'matrix' => null, 'pool' => null, 'produk' => null,
            ]);
        }

        // ABC: distribusi opex GL ke pool (tahap-1) & P&L per produk (tahap-2).
        if ($view === 'pool' || $view === 'produk') {
            return Inertia::render('dashboard/cost', [
                'hasData' => true, 'periods' => $periods, 'period' => $period, 'view' => $view,
                'kpi' => null, 'sections' => [], 'topExpense' => [], 'groups' => [], 'trend' => [],
                'compare' => null, 'matrix' => null,
                'pool' => $view === 'pool' ? $abc->poolTotals($period) : null,
                'produk' => $view === 'produk' ? $abc->productPnl($period) : null,
            ]);
        }

        // Bandingkan 2 periode: default periode terbaru vs periode sebelumnya.
        if ($view === 'banding') {
            $a = (string) ($request->input('a') ?: ($periods[0] ?? ''));
            $b = (string) ($request->input('b') ?: ($periods[1] ?? $periods[0] ?? ''));

            return Inertia::render('dashboard/cost', [
                'hasData' => true, 'periods' => $periods, 'period' => $period, 'view' => $view,
                'kpi' => null, 'sections' => [], 'topExpense' => [], 'groups' => [], 'trend' => [],
                'compare' => $this->costCompare($a, $b),
                'matrix' => null,
            ]);
        }

        if ($view === 'matriks') {
            return Inertia::render('dashboard/cost', [
                'hasData' => true, 'periods' => $periods, 'period' => $period, 'view' => $view,
                'kpi' => null, 'sections' => [], 'topExpense' => [], 'groups' => [], 'trend' => [],
                'compare' => null,
                'matrix' => $this->costMatrix($periods->reverse()->values()->all()),
            ]);
        }

        // Tanda: pendapatan/income bersaldo kredit (amount negatif) → dibalik agar terbaca wajar.
        $bySection = DB::table('dwh_stg_gl as g')
            ->join('dwh_stg_acc_glaccount as c', 'c.no', '=', 'g.account_code')
            ->where('g.period', $period)
            ->whereIn('c.account_type', ['REVENUE', 'COGS', 'EXPENSE', 'OTHER_EXPENSE', 'OTHER_INCOME'])
            ->selectRaw('c.account_type, COUNT(DISTINCT g.account_code) akun, SUM(g.amount) net')
            ->groupBy('c.account_type')->pluck('net', 'account_type');

        $val = fn (string $t) => (float) ($bySection[$t] ?? 0);
        $pendapatan = -$val('REVENUE');
        $hpp = $val('COGS');
        $beban = $val('EXPENSE');
        $bebanLain = $val('OTHER_EXPENSE');
        $pendapatanLain = -$val('OTHER_INCOME');
        $labaKotor = $pendapatan - $hpp;
        $labaBersih = $labaKotor - $beban - $bebanLain + $pendapatanLain;

        // `types` = accountType penyusun baris itu → dipakai drill-down. Baris hasil
        // hitungan (Laba Kotor / Laba Bersih) tidak punya akun, jadi types-nya null.
        $sections = [
            ['label' => 'Pendapatan', 'value' => $pendapatan, 'type' => 'in', 'types' => 'REVENUE'],
            ['label' => 'Beban Pokok Penjualan (HPP)', 'value' => -$hpp, 'type' => 'out', 'types' => 'COGS'],
            ['label' => 'Laba Kotor', 'value' => $labaKotor, 'type' => 'sub', 'types' => null, 'formula' => 'Pendapatan − HPP'],
            ['label' => 'Beban Operasional', 'value' => -$beban, 'type' => 'out', 'types' => 'EXPENSE'],
            ['label' => 'Beban Non-Operasional', 'value' => -$bebanLain, 'type' => 'out', 'types' => 'OTHER_EXPENSE'],
            ['label' => 'Pendapatan Non-Operasional', 'value' => $pendapatanLain, 'type' => 'in', 'types' => 'OTHER_INCOME'],
            ['label' => 'Laba Bersih', 'value' => $labaBersih, 'type' => 'total', 'types' => null,
                'formula' => 'Laba Kotor − Beban Operasional − Beban Non-Op + Pendapatan Non-Op'],
        ];

        // Beban terbesar per akun (EXPENSE + OTHER_EXPENSE + COGS).
        $topExpense = DB::table('dwh_stg_gl as g')
            ->join('dwh_stg_acc_glaccount as c', 'c.no', '=', 'g.account_code')
            ->leftJoin('dwh_map_coa as m', 'm.account_code', '=', 'g.account_code')
            ->where('g.period', $period)
            ->whereIn('c.account_type', ['EXPENSE', 'OTHER_EXPENSE', 'COGS'])
            ->selectRaw('g.account_code, MAX(c.name) nama, MAX(c.parent_name) grup, MAX(m.category) kategori,
                COUNT(*) baris, SUM(g.amount) net')
            ->groupBy('g.account_code')->orderByDesc('net')->limit(15)->get()
            ->map(fn ($r) => [
                'code' => $r->account_code, 'nama' => $r->nama, 'grup' => $r->grup,
                'kategori' => $r->kategori, 'baris' => (int) $r->baris, 'value' => (float) $r->net,
            ])->values();

        // Kelompok biaya: pakai kategori manual bila ada, kalau tidak pakai parent COA.
        $groups = DB::table('dwh_stg_gl as g')
            ->join('dwh_stg_acc_glaccount as c', 'c.no', '=', 'g.account_code')
            ->leftJoin('dwh_map_coa as m', 'm.account_code', '=', 'g.account_code')
            ->where('g.period', $period)
            ->whereIn('c.account_type', ['EXPENSE', 'OTHER_EXPENSE'])
            ->selectRaw('COALESCE(NULLIF(m.category, ""), c.parent_name, "(tanpa grup)") label, SUM(g.amount) net')
            ->groupBy('label')->orderByDesc('net')->limit(12)->get()
            ->map(fn ($r) => ['label' => (string) $r->label, 'value' => (float) $r->net])->values();

        // Tren antar periode. Rumus laba WAJIB sama persis dengan KPI di atas (termasuk
        // pendapatan & beban non-operasional) — kalau tidak, satu halaman menampilkan dua
        // angka laba yang berbeda untuk bulan yang sama.
        $trend = DB::table('dwh_stg_gl as g')
            ->join('dwh_stg_acc_glaccount as c', 'c.no', '=', 'g.account_code')
            ->selectRaw('g.period,
                SUM(CASE WHEN c.account_type = "REVENUE" THEN -g.amount ELSE 0 END) pendapatan,
                SUM(CASE WHEN c.account_type IN ("EXPENSE","OTHER_EXPENSE") THEN g.amount ELSE 0 END) beban,
                SUM(CASE WHEN c.account_type = "OTHER_INCOME" THEN -g.amount ELSE 0 END) pendapatan_lain,
                SUM(CASE WHEN c.account_type = "COGS" THEN g.amount ELSE 0 END) hpp')
            ->groupBy('g.period')->orderBy('g.period')->get()
            ->map(function ($r) {
                $pendapatan = (float) $r->pendapatan;
                $hpp = (float) $r->hpp;
                $beban = (float) $r->beban;
                $laba = $pendapatan - $hpp - $beban + (float) $r->pendapatan_lain;

                return [
                    'period' => $r->period,
                    'pendapatan' => $pendapatan,
                    'beban' => $beban,
                    'hpp' => $hpp,
                    'laba' => $laba,
                    'margin' => $pendapatan > 0 ? round($laba / $pendapatan * 100, 1) : null,
                ];
            })->values();

        $meta = DB::table('dwh_stg_gl')->where('period', $period)
            ->selectRaw('COUNT(*) baris, SUM(amount) balance, MAX(imported_at) imported_at, MAX(branch) branch')->first();

        return Inertia::render('dashboard/cost', [
            'hasData' => true,
            'periods' => $periods,
            'period' => $period,
            'view' => $view,
            'compare' => null,
            'matrix' => null,
            'kpi' => [
                'pendapatan' => $pendapatan,
                'hpp' => $hpp,
                'labaKotor' => $labaKotor,
                'beban' => $beban,
                'labaBersih' => $labaBersih,
                'marginKotor' => $pendapatan > 0 ? round($labaKotor / $pendapatan * 100, 1) : null,
                'marginBersih' => $pendapatan > 0 ? round($labaBersih / $pendapatan * 100, 1) : null,
                'baris' => (int) ($meta->baris ?? 0),
                'seimbang' => abs((float) ($meta->balance ?? 0)) < 1,
                'importedAt' => $meta->imported_at ?? null,
                'branch' => $meta->branch ?? null,
            ],
            'sections' => $sections,
            'topExpense' => $topExpense,
            'groups' => $groups,
            'trend' => $trend,
        ]);
    }

    /**
     * Drilldown Stock: daftar lengkap di balik setiap kotak KPI.
     *
     * Tanpa ini beberapa KPI tak bisa ditelusuri sama sekali — mis. "Stok Habis" yang
     * tidak punya tabel di halaman.
     */
    public function stockDrilldown(Request $request, WarehouseActivityService $wa): JsonResponse
    {
        $kind = (string) $request->input('kind');
        $dead = (int) ($request->input('dead') ?: 180);
        $batas = now()->subDays($dead)->toDateString();

        // ── Rincian mutasi stok ERP untuk satu bulan (klik batang chart) ──
        if ($kind === 'mov') {
            $period = (string) $request->input('period');
            if (! preg_match('/^\d{4}-\d{2}$/', $period)) {
                return response()->json(['error' => 'periode tidak valid'], 422);
            }
            $d = app(ErpStockSyncService::class)->movementDetailByMonth($period);

            return response()->json([
                'mode' => 'mov',
                'title' => 'Mutasi stok — item yang bergerak',
                'period' => $period,
                'summary' => $d['summary'] + ['rows' => count($d['rows'])],
                'byType' => $d['byType'],
                'rows' => $d['rows'],
                'truncated' => $d['truncated'],
            ]);
        }

        // ── Sisi persediaan (snapshot ERP ⨝ terakhir terjual) ──
        if (in_array($kind, ['sku', 'low', 'dead', 'habis'], true)) {
            $lastSold = DB::table('sales_facts')
                ->selectRaw('part_number, MAX(invoice_date) last_sold')
                ->whereNotNull('part_number')->where('part_number', '!=', '')
                ->groupBy('part_number');

            $q = DB::query()
                ->fromSub(InventorySnapshot::erp(), 'e')
                ->leftJoinSub($lastSold, 's', 's.part_number', '=', 'e.ref');

            [$title, $order] = match ($kind) {
                'low' => ['Stok Menipis — di bawah titik pesan ulang', '(e.buffer - e.qty) DESC'],
                'dead' => ["Stok Mati / Lambat — tak terjual > {$dead} hari", 'e.qty DESC'],
                'habis' => ['Stok Habis — pernah bergerak, saldo kini nol', 's.last_sold DESC'],
                default => ['Seluruh SKU Bergerak', 'e.qty DESC'],
            };

            match ($kind) {
                'low' => $q->whereRaw('e.qty > 0 AND e.buffer > 0 AND e.qty < e.buffer'),
                'dead' => $q->whereRaw('e.qty > 0 AND (s.last_sold IS NULL OR s.last_sold < ?)', [$batas]),
                'habis' => $q->whereRaw('e.qty = 0'),
                default => null,
            };

            // Hitung total & qty SEBELUM dipotong — kalau tidak, daftar yang terpotong
            // akan terbaca seolah itulah seluruh isinya.
            $agg = (clone $q)->selectRaw('COUNT(*) c, COALESCE(SUM(e.qty),0) q')->first();
            $total = (int) ($agg->c ?? 0);
            $cap = 500;

            $rows = $q->selectRaw('e.ref, e.label, e.principal, e.category_l2, e.qty, e.buffer,
                    (e.buffer - e.qty) kurang, s.last_sold, DATEDIFF(CURDATE(), s.last_sold) umur')
                ->orderByRaw($order)->limit($cap)->get()
                ->map(fn ($r) => [
                    'ref' => $r->ref, 'label' => $r->label, 'principal' => $r->principal,
                    'category' => $r->category_l2,
                    'qty' => (float) $r->qty, 'buffer' => (float) $r->buffer, 'kurang' => (float) $r->kurang,
                    'lastSold' => $r->last_sold, 'umur' => $r->umur === null ? null : (int) $r->umur,
                ])->values();

            return response()->json([
                'mode' => 'stok',
                'title' => $title,
                'summary' => [
                    'rows' => $rows->count(),
                    'total' => $total,
                    'qty' => (float) ($agg->q ?? 0),
                    'truncated' => $total > $cap,
                ],
                'rows' => $rows,
            ]);
        }

        // ── Sisi gudang ──
        if (in_array($kind, ['sent', 'used', 'kembali', 'hit', 'detail', 'rit_do', 'rit_tindakan', 'rit_menunggu', 'ship', 'ship_nolapor', 'ship_nosj'], true)) {
            $range = $wa->range();
            $to = (string) ($request->input('to') ?: ($range['max'] ?? now()->toDateString()));
            $from = (string) ($request->input('from') ?: Carbon::parse($to)->subMonths(6)->startOfMonth()->toDateString());

            // Daftar pengiriman (surat jalan / tindakan yang sudah deliver).
            if (in_array($kind, ['ship', 'ship_nolapor', 'ship_nosj'], true)) {
                $filter = match ($kind) {
                    'ship_nolapor' => 'no_usage',
                    'ship_nosj' => 'no_sj',
                    default => 'all',
                };
                $rows = collect($wa->shipmentList($from, $to, $filter));
                $title = match ($kind) {
                    'ship_nolapor' => 'Pengiriman yang belum ada usage report',
                    'ship_nosj' => 'Pengiriman tanpa nomor surat jalan',
                    default => 'Daftar pengiriman (surat jalan)',
                };

                return response()->json([
                    'mode' => 'ship',
                    'title' => $title,
                    'summary' => [
                        'rows' => $rows->count(),
                        'menunggu' => (int) $rows->where('belumLapor', true)->count(),
                    ],
                    'rows' => $rows->values(),
                ]);
            }

            // Rincian ritase: dokumen apa saja yang menghasilkan trip-trip itu.
            if (in_array($kind, ['rit_do', 'rit_tindakan', 'rit_menunggu'], true)) {
                $rows = collect(match ($kind) {
                    'rit_do' => $wa->ritaseDoList($from, $to),
                    'rit_menunggu' => $wa->ritaseTindakanList($from, $to, true),
                    default => $wa->ritaseTindakanList($from, $to),
                });

                $title = match ($kind) {
                    'rit_do' => 'DO — 1 trip masing-masing (kirim saja)',
                    'rit_menunggu' => 'Penarikan menunggu — alat sudah dikirim, belum ditarik',
                    default => 'Tindakan — 2 trip masing-masing (kirim + penarikan alat)',
                };

                return response()->json([
                    'mode' => 'ritase',
                    'title' => $title,
                    'summary' => [
                        'rows' => $rows->count(),
                        'trip' => (int) $rows->sum('trip'),
                        'menunggu' => (int) $rows->where('menunggu', true)->count(),
                    ],
                    'rows' => $rows->values(),
                ]);
            }

            // Level terdalam: daftar tindakan / surat jalan.
            if ($kind === 'detail') {
                $ref = $request->input('ref');
                $rs = $request->input('rs');
                // Nama pasien & dokter mengikuti aturan yang sama dengan drilldown penjualan.
                $sensitive = (bool) $request->user()?->canSeeSensitiveSales();
                $rows = collect($wa->detail($from, $to, $ref, $rs, $sensitive));

                return response()->json([
                    'mode' => 'detail',
                    'title' => filled($ref)
                        ? 'Tindakan yang memuat item '.$ref
                        : (filled($rs) ? 'Tindakan di '.$rs : 'Seluruh tindakan'),
                    'sensitive' => $sensitive,
                    'summary' => [
                        'rows' => $rows->count(),
                        'kasus' => $rows->pluck('tindakan')->unique()->count(),
                        'sent' => (float) $rows->sum('sent'),
                        'used' => (float) $rows->sum('used'),
                        'kembali' => (float) $rows->sum('sent') - (float) $rows->sum('used'),
                    ],
                    'rows' => $rows->values(),
                ]);
            }

            $rows = collect($wa->byItem($from, $to, $kind));
            $title = match ($kind) {
                'used' => 'Item paling banyak TERPAKAI',
                'kembali' => 'Item paling banyak KEMBALI (diangkut tapi tak terpakai)',
                'hit' => 'Hit-rate terburuk — paling sering mubazir',
                default => 'Item paling banyak DIANGKUT',
            };

            return response()->json([
                'mode' => 'gudang',
                'title' => $title,
                'summary' => [
                    'rows' => $rows->count(),
                    'sent' => (float) $rows->sum('sent'),
                    'used' => (float) $rows->sum('used'),
                    'kembali' => (float) $rows->sum('kembali'),
                ],
                'rows' => $rows->values(),
            ]);
        }

        return response()->json(['error' => 'jenis drilldown tidak dikenal'], 422);
    }

    /**
     * Bandingkan 2 periode per akun — menjawab "apa yang membuat beban naik/turun".
     *
     * Tanda dinormalkan: pendapatan (bersaldo kredit) dibalik agar semua angka terbaca
     * wajar, dan `naik` selalu berarti "lebih besar dari pembanding".
     *
     * @return array<string, mixed>
     */
    protected function costCompare(string $a, string $b): array
    {
        $rows = DB::table('dwh_stg_gl as g')
            ->join('dwh_stg_acc_glaccount as c', 'c.no', '=', 'g.account_code')
            ->leftJoin('dwh_map_coa as m', 'm.account_code', '=', 'g.account_code')
            ->whereIn('g.period', [$a, $b])
            ->whereIn('c.account_type', self::PL_TYPES)
            ->selectRaw('g.account_code, MAX(c.name) nama, MAX(c.parent_name) grup, MAX(m.category) kategori,
                MAX(c.account_type) tipe,
                SUM(CASE WHEN g.period = ? THEN g.amount ELSE 0 END) va,
                SUM(CASE WHEN g.period = ? THEN g.amount ELSE 0 END) vb', [$a, $b])
            ->groupBy('g.account_code')
            ->get()
            ->map(function ($r) {
                $flip = in_array($r->tipe, ['REVENUE', 'OTHER_INCOME'], true) ? -1 : 1;
                $va = $flip * (float) $r->va;
                $vb = $flip * (float) $r->vb;
                $delta = $va - $vb;

                return [
                    'code' => $r->account_code,
                    'name' => $r->nama,
                    'group' => $r->kategori ?: $r->grup,
                    'type' => $r->tipe,
                    'a' => $va,
                    'b' => $vb,
                    'delta' => $delta,
                    // Persentase tak bermakna bila pembanding nol (mis. akun baru muncul).
                    'pct' => abs($vb) > 0.005 ? round($delta / abs($vb) * 100, 1) : null,
                ];
            })
            ->filter(fn ($r) => abs($r['a']) > 0.005 || abs($r['b']) > 0.005)
            ->sortByDesc(fn ($r) => abs($r['delta']))
            ->values();

        $sum = fn (string $k, array $types) => (float) $rows->whereIn('type', $types)->sum($k);

        return [
            'a' => $a,
            'b' => $b,
            'rows' => $rows,
            'totals' => [
                'pendapatan' => ['a' => $sum('a', ['REVENUE']), 'b' => $sum('b', ['REVENUE'])],
                'hpp' => ['a' => $sum('a', ['COGS']), 'b' => $sum('b', ['COGS'])],
                'beban' => ['a' => $sum('a', ['EXPENSE', 'OTHER_EXPENSE']), 'b' => $sum('b', ['EXPENSE', 'OTHER_EXPENSE'])],
                'lain' => ['a' => $sum('a', ['OTHER_INCOME']), 'b' => $sum('b', ['OTHER_INCOME'])],
            ],
        ];
    }

    /**
     * Matriks akun × periode — setara "Laba/Rugi Multi Periode" Accurate, tapi memakai
     * kode akun (bukan nama, yang bisa duplikat) dan tiap sel bisa ditelusuri.
     *
     * @param  list<string>  $periods  urut lama → baru
     * @return array<string, mixed>
     */
    protected function costMatrix(array $periods): array
    {
        $raw = DB::table('dwh_stg_gl as g')
            ->join('dwh_stg_acc_glaccount as c', 'c.no', '=', 'g.account_code')
            ->leftJoin('dwh_map_coa as m', 'm.account_code', '=', 'g.account_code')
            ->whereIn('c.account_type', self::PL_TYPES)
            ->selectRaw('g.account_code, g.period, MAX(c.name) nama, MAX(c.parent_name) grup,
                MAX(m.category) kategori, MAX(c.account_type) tipe, SUM(g.amount) net')
            ->groupBy('g.account_code', 'g.period')
            ->get();

        $acc = [];
        foreach ($raw as $r) {
            $flip = in_array($r->tipe, ['REVENUE', 'OTHER_INCOME'], true) ? -1 : 1;
            $acc[$r->account_code] ??= [
                'code' => $r->account_code, 'name' => $r->nama,
                'group' => $r->kategori ?: $r->grup, 'type' => $r->tipe,
                'values' => array_fill_keys($periods, 0.0), 'total' => 0.0,
            ];
            $v = $flip * (float) $r->net;
            $acc[$r->account_code]['values'][$r->period] = $v;
            $acc[$r->account_code]['total'] += $v;
        }

        // Urutkan per tipe (mengikuti urutan laporan), lalu nilai terbesar.
        $order = array_flip(self::PL_TYPES);
        $rows = collect($acc)->sort(function ($x, $y) use ($order) {
            return [$order[$x['type']] ?? 9, -abs($x['total'])] <=> [$order[$y['type']] ?? 9, -abs($y['total'])];
        })->values();

        $totals = [];
        foreach (self::PL_TYPES as $t) {
            $sub = $rows->where('type', $t);
            $totals[$t] = [
                'per_period' => collect($periods)->mapWithKeys(fn ($p) => [$p => (float) $sub->sum(fn ($r) => $r['values'][$p])])->all(),
                'total' => (float) $sub->sum('total'),
            ];
        }

        return ['periods' => $periods, 'rows' => $rows, 'totals' => $totals];
    }

    /**
     * Drilldown Cost: baris buku besar di balik satu akun pada satu periode.
     *
     * Ini yang membuat angka bisa ditelusuri sendiri sampai nomor bukti — tanpa perlu
     * membuka Accurate atau menjalankan query manual.
     */
    public function costDrilldown(Request $request): JsonResponse
    {
        $period = (string) $request->input('period');
        $code = (string) $request->input('account');
        $types = array_filter(explode(',', (string) $request->input('types')));

        if ($period === '') {
            return response()->json(['error' => 'periode wajib diisi'], 422);
        }

        // Level 1 — bedah satu baris P&L jadi akun-akun penyusunnya.
        if ($code === '' && $types) {
            return $this->costAccounts($period, $types, (string) $request->input('label'));
        }

        if ($code === '') {
            return response()->json(['error' => 'akun atau types wajib diisi'], 422);
        }

        $acc = DB::table('dwh_stg_acc_glaccount')->where('no', $code)->first();

        $rows = DB::table('dwh_stg_gl')
            ->where('period', $period)->where('account_code', $code)
            ->orderByDesc('amount')
            ->get(['trx_type', 'doc_no', 'description', 'debit', 'credit', 'amount', 'row_no'])
            ->map(fn ($r) => [
                'trx_type' => $r->trx_type,
                'doc_no' => $r->doc_no,
                // Keterangan buku besar boleh multi-baris; ratakan agar rapi di tabel.
                'description' => $r->description === null ? null : preg_replace('/\s*\R\s*/u', ' · ', $r->description),
                'debit' => (float) $r->debit,
                'credit' => (float) $r->credit,
                'amount' => (float) $r->amount,
                'row_no' => (int) $r->row_no,
            ])->values();

        $byType = DB::table('dwh_stg_gl')
            ->where('period', $period)->where('account_code', $code)
            ->selectRaw('trx_type, COUNT(*) n, SUM(amount) net')
            ->groupBy('trx_type')->orderByDesc('net')->get()
            ->map(fn ($r) => ['trx_type' => $r->trx_type ?? '(tanpa tipe)', 'n' => (int) $r->n, 'net' => (float) $r->net])->values();

        return response()->json([
            'period' => $period,
            'account' => [
                'code' => $code,
                'name' => $acc->name ?? null,
                'type' => $acc->account_type ?? null,
                'parent' => $acc->parent_name ?? null,
            ],
            'summary' => [
                'rows' => $rows->count(),
                'debit' => (float) $rows->sum('debit'),
                'credit' => (float) $rows->sum('credit'),
                'net' => (float) $rows->sum('amount'),
            ],
            'byType' => $byType,
            'rows' => $rows,
        ]);
    }

    /**
     * Level 1 drilldown Cost: akun-akun penyusun satu baris P&L (mis. "Beban Operasional").
     *
     * @param  list<string>  $types  accountType COA
     */
    protected function costAccounts(string $period, array $types, string $label): JsonResponse
    {
        // Pendapatan bersaldo kredit (amount negatif) → dibalik agar terbaca wajar,
        // sama seperti perlakuan di halaman Cost.
        $flip = count(array_intersect($types, ['REVENUE', 'OTHER_INCOME'])) > 0;

        $rows = DB::table('dwh_stg_gl as g')
            ->join('dwh_stg_acc_glaccount as c', 'c.no', '=', 'g.account_code')
            ->leftJoin('dwh_map_coa as m', 'm.account_code', '=', 'g.account_code')
            ->where('g.period', $period)
            ->whereIn('c.account_type', $types)
            ->selectRaw('g.account_code, MAX(c.name) nama, MAX(c.parent_name) grup, MAX(m.category) kategori,
                COUNT(*) baris, SUM(g.amount) net')
            ->groupBy('g.account_code')
            ->get()
            ->map(fn ($r) => [
                'code' => $r->account_code,
                'name' => $r->nama,
                'group' => $r->kategori ?: $r->grup,
                'rows' => (int) $r->baris,
                'value' => $flip ? -(float) $r->net : (float) $r->net,
            ])
            ->sortByDesc('value')->values();

        return response()->json([
            'mode' => 'accounts',
            'period' => $period,
            'label' => $label ?: implode(', ', $types),
            'summary' => ['accounts' => $rows->count(), 'rows' => (int) $rows->sum('rows'), 'total' => (float) $rows->sum('value')],
            'accounts' => $rows,
        ]);
    }

    /**
     * Lazy drilldown: return the detail invoice lines behind a clicked dashboard
     * figure, filtered + paginated. Loaded on demand (JSON), not with the page.
     */
    public function drilldown(Request $request): JsonResponse
    {
        $q = SalesFact::query();
        $parts = [];

        if ($request->filled('year')) {
            $q->where('tahun', $request->string('year'));
            $parts[] = 'Tahun '.$request->input('year');
        }
        if ($request->filled('month')) {
            $q->whereRaw('MONTH(invoice_date) = ?', [(int) $request->input('month')]);
            $parts[] = 'Bulan '.$request->input('month');
        }
        if ($request->filled('months')) {
            $list = array_filter(explode(',', (string) $request->input('months')));
            $q->where(function ($w) use ($list) {
                foreach ($list as $ym) {
                    $w->orWhereRaw("DATE_FORMAT(invoice_date, '%Y-%m') = ?", [$ym]);
                }
            });
            $parts[] = implode(' vs ', array_map(fn ($ym) => $this->monthLabel($ym), $list));
        }
        if ($request->filled('customer')) {
            $q->where('customer', $request->input('customer'));
            $parts[] = $request->input('customer');
        }
        if ($request->filled('region')) {
            $q->where('region', $request->input('region'));
            $parts[] = 'Region '.$request->input('region');
        }
        if ($request->filled('merk')) {
            $q->where('merk', $request->input('merk'));
            $parts[] = 'Merk '.$request->input('merk');
        }
        if ($request->filled('sales')) {
            $q->where('sales', $request->input('sales'));
            $parts[] = 'Sales '.$request->input('sales');
        }
        if ($request->filled('produk')) {
            $q->where('description', $request->input('produk'));
            $parts[] = $request->input('produk');
        }
        if ($request->filled('status')) {
            $q->where('paid_unpaid', $request->string('status'));
            $parts[] = $request->input('status');
        }
        if ($request->filled('aging')) {
            $bucket = $request->string('aging')->toString();
            $q->where('paid_unpaid', 'UNPAID');
            $this->applyAging($q, $bucket);
            $labels = ['belum' => 'Belum jatuh tempo', '1-30' => '1–30 hari', '31-60' => '31–60 hari', '61-90' => '61–90 hari', '90plus' => '> 90 hari'];
            $parts[] = 'Aging: '.($labels[$bucket] ?? $bucket);
        }
        if ($request->boolean('discounted')) {
            $q->where('disc_value', '>', 0);
            $parts[] = 'Berdiskon';
        }

        // Filter generik dari Pivot Explorer: f[<dimKey>]=<nilai> untuk dimensi apa pun
        // di whitelist (termasuk kategori, dokter, bulan, dll). Sentinel (kosong) → NULL/''.
        $canSensitive = (bool) $request->user()?->canSeeSensitiveSales();
        $generic = $request->input('f', []);
        if (is_array($generic)) {
            foreach ($generic as $key => $val) {
                $key = (string) $key;
                if (! SD::isDim($key) || (SD::isSensitive($key) && ! $canSensitive)) {
                    continue;
                }
                $sql = SD::dimSql($key);
                $val = (string) $val;
                if ($val === SD::EMPTY_LABEL) {
                    $q->whereRaw("($sql) IS NULL OR ($sql) = ''");
                    $parts[] = SD::dimLabel($key).': (kosong)';
                } else {
                    $q->whereRaw("($sql) = ?", [$val]);
                    $parts[] = SD::dimLabel($key).': '.$val;
                }
            }
        }

        // Mode khusus: invoice di-grup per customer (untuk kartu "Jumlah Invoice").
        if ($request->input('group') === 'invoice-customer') {
            return $this->invoicesByCustomer($q, $parts);
        }

        // Mode khusus: fokus diskon (brutto, diskon, net).
        if ($request->input('view') === 'discount') {
            return $this->discountDetail($q, $parts);
        }

        // Mode khusus: collection rate (komposisi tertagih vs total).
        if ($request->input('view') === 'collection') {
            return $this->collectionDetail($q);
        }

        // Mode khusus: daftar customer + total penjualan.
        if ($request->input('view') === 'customers') {
            return $this->customerTotals($q, $parts);
        }

        // Mode khusus: aging piutang per invoice (jatuh tempo + hari telat).
        if ($request->filled('aging')) {
            return $this->agingDetail($q, $parts);
        }

        $cols = [
            'id', 'invoice_no', 'invoice_date', 'customer', 'part_number', 'description',
            'quantity', 'dpp', 'total', 'sales', 'paid_unpaid', 'erp_invoice_id',
        ];
        // Kolom sensitif hanya untuk yang berhak (super admin + CEO/HFO/HOO).
        if ($canSensitive) {
            array_splice($cols, 4, 0, ['patient', 'doctor']);
        }

        $sum = (clone $q)->selectRaw('COUNT(*) c, SUM(dpp) dpp, SUM(total) total')->first();

        // Mode perbandingan 2 bulan: rincian + tabel per bulan (untuk pembacaan cepat direksi).
        $compare = null;
        if ($request->filled('months')) {
            $list = array_values(array_filter(explode(',', (string) $request->input('months'))));
            if (count($list) === 2) {
                $per = (clone $q)
                    ->selectRaw("DATE_FORMAT(invoice_date, '%Y-%m') ym, SUM(dpp) dpp, COUNT(*) c, COUNT(DISTINCT invoice_no) inv")
                    ->groupBy('ym')->get()->keyBy('ym');
                [$lastYm, $prevYm] = $list; // dikirim: bulan terbaru dulu, lalu pembanding

                $monthRows = fn (string $ym) => (clone $q)
                    ->whereRaw("DATE_FORMAT(invoice_date, '%Y-%m') = ?", [$ym])
                    ->orderByDesc('total')->limit(100)->get($cols);

                $lastDpp = (float) ($per[$lastYm]->dpp ?? 0);
                $prevDpp = (float) ($per[$prevYm]->dpp ?? 0);
                $compare = [
                    'prev' => ['ym' => $prevYm, 'dpp' => $prevDpp, 'invoices' => (int) ($per[$prevYm]->inv ?? 0), 'count' => (int) ($per[$prevYm]->c ?? 0), 'rows' => $monthRows($prevYm)],
                    'last' => ['ym' => $lastYm, 'dpp' => $lastDpp, 'invoices' => (int) ($per[$lastYm]->inv ?? 0), 'count' => (int) ($per[$lastYm]->c ?? 0), 'rows' => $monthRows($lastYm)],
                    'diff' => $lastDpp - $prevDpp,
                    'growth' => $prevDpp > 0 ? round(($lastDpp - $prevDpp) / $prevDpp * 100, 1) : null,
                ];
            }
        }

        $rows = $q->orderByDesc('invoice_date')->orderByDesc('id')->paginate(25, $cols);

        return response()->json([
            'title' => $parts ? implode(' · ', $parts) : 'Detail',
            'summary' => [
                'count' => (int) ($sum->c ?? 0),
                'dpp' => (float) ($sum->dpp ?? 0),
                'total' => (float) ($sum->total ?? 0),
            ],
            'rows' => $rows,
            'compare' => $compare,
            'erpBaseUrl' => config('erp.base_url') ?: null,
        ]);
    }

    /**
     * Invoices aggregated per invoice number, grouped by customer.
     *
     * @param  array<int, string>  $parts
     */
    protected function invoicesByCustomer($q, array $parts): JsonResponse
    {
        $invoices = (clone $q)
            ->selectRaw('customer, invoice_no, MIN(invoice_date) inv_date, COUNT(*) line_count, SUM(total) total, SUM(dpp) dpp, MAX(erp_invoice_id) erp_id, MAX(paid_unpaid) status')
            ->groupBy('customer', 'invoice_no')
            ->get();

        $groups = $invoices
            ->groupBy(fn ($r) => $r->customer ?: '(tanpa customer)')
            ->map(fn ($items, $customer) => [
                'customer' => $customer,
                'invoiceCount' => $items->count(),
                'total' => (float) $items->sum('total'),
                'dpp' => (float) $items->sum('dpp'),
                'invoices' => $items->sortByDesc('total')->values()->map(fn ($r) => [
                    'invoice_no' => $r->invoice_no,
                    'date' => $r->inv_date,
                    'lines' => (int) $r->line_count,
                    'total' => (float) $r->total,
                    'status' => $r->status,
                    'erp_id' => $r->erp_id,
                ]),
            ])
            ->sortByDesc('total')
            ->values();

        return response()->json([
            'title' => $parts ? implode(' · ', $parts).' — Invoice per Customer' : 'Invoice per Customer',
            'mode' => 'invoice-customer',
            'summary' => [
                'invoices' => $invoices->count(),
                'customers' => $groups->count(),
                'total' => (float) $invoices->sum('total'),
                'dpp' => (float) $invoices->sum('dpp'),
            ],
            'groups' => $groups,
            'erpBaseUrl' => config('erp.base_url') ?: null,
        ]);
    }

    /**
     * Discount-focused detail: gross (brutto), discount, net per line — biggest discount first.
     *
     * @param  array<int, string>  $parts
     */
    protected function discountDetail($q, array $parts): JsonResponse
    {
        $sum = (clone $q)->selectRaw('COUNT(*) c, SUM(dpp + disc_value) brutto, SUM(disc_value) diskon, SUM(dpp) net')->first();

        $rows = (clone $q)
            ->select(['id', 'invoice_no', 'invoice_date', 'customer', 'part_number', 'description', 'quantity', 'disc', 'disc_value', 'dpp', 'total', 'paid_unpaid', 'erp_invoice_id'])
            ->selectRaw('(dpp + disc_value) AS brutto')
            ->orderByDesc('disc_value')
            ->paginate(25);

        return response()->json([
            'title' => $parts ? implode(' · ', $parts) : 'Diskon',
            'mode' => 'discount',
            'summary' => [
                'count' => (int) ($sum->c ?? 0),
                'brutto' => (float) ($sum->brutto ?? 0),
                'diskon' => (float) ($sum->diskon ?? 0),
                'net' => (float) ($sum->net ?? 0),
                'dpp' => (float) ($sum->net ?? 0),
                'total' => (float) ($sum->brutto ?? 0),
            ],
            'rows' => $rows,
            'erpBaseUrl' => config('erp.base_url') ?: null,
        ]);
    }

    /**
     * Collection rate composition: tertagih (PAID) vs total tagihan (PAID + UNPAID),
     * with the collected invoice lines listed (biggest first).
     */
    protected function collectionDetail($q): JsonResponse
    {
        $paid = (float) (clone $q)->where('paid_unpaid', 'PAID')->sum('total');
        $unpaid = (float) (clone $q)->where('paid_unpaid', 'UNPAID')->sum('total');
        $grand = $paid + $unpaid;
        $rate = $grand > 0 ? round($paid / $grand * 100, 1) : 0;

        $rows = (clone $q)->where('paid_unpaid', 'PAID')
            ->orderByDesc('total')
            ->paginate(25, [
                'id', 'invoice_no', 'invoice_date', 'customer', 'part_number', 'description',
                'quantity', 'dpp', 'total', 'sales', 'paid_unpaid', 'erp_invoice_id',
            ]);

        return response()->json([
            'title' => 'Collection Rate — komposisi tagihan',
            'mode' => 'collection',
            'collection' => [
                'paid' => $paid,
                'unpaid' => $unpaid,
                'grand' => $grand,
                'rate' => $rate,
                'paidInvoices' => (int) (clone $q)->where('paid_unpaid', 'PAID')->distinct()->count('invoice_no'),
                'unpaidInvoices' => (int) (clone $q)->where('paid_unpaid', 'UNPAID')->distinct()->count('invoice_no'),
            ],
            'summary' => ['count' => $rows->total(), 'dpp' => 0, 'total' => $paid],
            'rows' => $rows,
            'erpBaseUrl' => config('erp.base_url') ?: null,
        ]);
    }

    /**
     * Active customers with their total sales (DPP), biggest first.
     *
     * @param  array<int, string>  $parts
     */
    protected function customerTotals($q, array $parts): JsonResponse
    {
        $customers = (clone $q)
            ->selectRaw('customer, SUM(dpp) dpp, SUM(total) total, COUNT(DISTINCT invoice_no) invoices')
            ->groupBy('customer')
            ->orderByDesc('dpp')
            ->get()
            ->map(fn ($r) => [
                'customer' => ($r->customer === null || $r->customer === '') ? '(tanpa customer)' : $r->customer,
                'dpp' => (float) $r->dpp,
                'total' => (float) $r->total,
                'invoices' => (int) $r->invoices,
            ]);

        return response()->json([
            'title' => $parts ? implode(' · ', $parts).' — Customer Aktif' : 'Customer Aktif',
            'mode' => 'customers',
            'summary' => [
                'count' => $customers->count(),
                'dpp' => (float) $customers->sum('dpp'),
                'total' => (float) $customers->sum('total'),
            ],
            'customers' => $customers,
            'erpBaseUrl' => config('erp.base_url') ?: null,
        ]);
    }

    /**
     * Aging detail per invoice: due date + days overdue + outstanding, most overdue first.
     *
     * @param  array<int, string>  $parts
     */
    protected function agingDetail($q, array $parts): JsonResponse
    {
        $sum = (clone $q)->selectRaw('COUNT(DISTINCT invoice_no) inv, SUM(total) total')->first();

        $rows = (clone $q)
            ->selectRaw('invoice_no, customer, MIN(invoice_date) inv_date, MIN(due_date) due_date, SUM(total) outstanding, COUNT(*) line_count, MAX(erp_invoice_id) erp_id, DATEDIFF(CURDATE(), MIN(due_date)) days_late')
            ->groupBy('invoice_no', 'customer')
            ->orderByDesc('days_late')
            ->limit(500)
            ->get()
            ->map(fn ($r) => [
                'invoice_no' => $r->invoice_no,
                'customer' => $r->customer,
                'inv_date' => $r->inv_date,
                'due_date' => $r->due_date,
                'days_late' => $r->days_late !== null ? (int) $r->days_late : null,
                'outstanding' => (float) $r->outstanding,
                'lines' => (int) $r->line_count,
            ]);

        return response()->json([
            'title' => $parts ? implode(' · ', $parts) : 'Aging Piutang',
            'mode' => 'aging',
            'summary' => [
                'count' => (int) ($sum->inv ?? 0),
                'dpp' => 0,
                'total' => (float) ($sum->total ?? 0),
            ],
            'aging' => $rows,
            'erpBaseUrl' => config('erp.base_url') ?: null,
        ]);
    }

    protected function monthLabel(string $ym): string
    {
        [$y, $m] = array_pad(explode('-', $ym), 2, null);
        $names = [1 => 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

        return ($names[(int) $m] ?? $m).' '.$y;
    }

    protected function applyAging($q, string $bucket): void
    {
        match ($bucket) {
            'belum' => $q->where(fn ($w) => $w->whereNull('due_date')->orWhereRaw('due_date >= CURDATE()')),
            '1-30' => $q->whereRaw('due_date < CURDATE() AND DATEDIFF(CURDATE(), due_date) BETWEEN 1 AND 30'),
            '31-60' => $q->whereRaw('due_date < CURDATE() AND DATEDIFF(CURDATE(), due_date) BETWEEN 31 AND 60'),
            '61-90' => $q->whereRaw('due_date < CURDATE() AND DATEDIFF(CURDATE(), due_date) BETWEEN 61 AND 90'),
            '90plus' => $q->whereRaw('due_date < CURDATE() AND DATEDIFF(CURDATE(), due_date) > 90'),
            default => null,
        };
    }
}
