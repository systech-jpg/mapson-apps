<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SalesFact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
