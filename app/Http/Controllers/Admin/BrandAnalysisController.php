<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SalesFact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Analisa Penjualan per Merk (principal) — pivot drill-down ala Excel.
 *
 * Halaman memuat kerangka (tahun + dimensi); isi tabel diambil lazy per level
 * lewat endpoint pivot() supaya hirarki dalam (Merk → Sales → Region → RS)
 * tidak pernah menghitung seluruh kombinasi sekaligus.
 */
class BrandAnalysisController extends Controller
{
    /** Dimensi pivot yang tersedia → kolom sales_facts. */
    protected const DIMS = [
        'merk' => 'merk',
        'sales' => 'sales',
        'region' => 'region',
        'customer' => 'customer',
        'produk' => 'description',
    ];

    /** Sentinel untuk nilai kosong/NULL agar tetap bisa difilter balik. */
    protected const EMPTY_LABEL = '(kosong)';

    public function index(Request $request): Response
    {
        $years = SalesFact::query()
            ->whereNotNull('tahun')->where('tahun', '!=', '')
            ->distinct()->orderByDesc('tahun')->pluck('tahun')->values();

        $year = (string) ($request->input('year') ?: ($years->first() ?? date('Y')));

        return Inertia::render('dashboard/brand-analysis', [
            'years' => $years,
            'year' => $year,
            'hasData' => SalesFact::query()->exists(),
        ]);
    }

    /**
     * Satu level pivot: kelompokkan baris di bawah `path` (filter dimensi yang
     * sudah dipilih) menurut dimensi berikutnya, dengan nilai per bulan + total.
     */
    public function pivot(Request $request): JsonResponse
    {
        $year = (string) ($request->input('year') ?: date('Y'));

        $metric = (string) $request->input('metric', 'dpp');
        $metricCol = match ($metric) {
            'total' => 'total',
            'qty' => 'COALESCE(quantity, 0)',
            default => 'dpp',
        };

        $dims = collect(explode(',', (string) $request->input('dims', 'merk')))
            ->filter(fn ($d) => array_key_exists($d, self::DIMS))
            ->unique()->values();
        if ($dims->isEmpty()) {
            $dims = collect(['merk']);
        }

        $path = $request->input('path', []);
        $path = is_array($path) ? $path : [];

        $q = SalesFact::query()->where('tahun', $year);

        // Terapkan filter dari path — hanya dimensi yang memang ada di urutan.
        $depth = 0;
        foreach ($dims as $dim) {
            if (! array_key_exists($dim, $path)) {
                break;
            }
            $col = self::DIMS[$dim];
            $val = (string) $path[$dim];
            if ($val === self::EMPTY_LABEL) {
                $q->where(fn ($w) => $w->whereNull($col)->orWhere($col, ''));
            } else {
                $q->where($col, $val);
            }
            $depth++;
        }

        if ($depth >= $dims->count()) {
            return response()->json(['rows' => [], 'hasChildren' => false]);
        }

        $groupCol = self::DIMS[(string) $dims[$depth]];

        $monthSelects = collect(range(1, 12))
            ->map(fn ($m) => "SUM(CASE WHEN MONTH(invoice_date) = $m THEN $metricCol ELSE 0 END) AS m$m")
            ->implode(', ');

        $rows = $q
            ->selectRaw("
                CASE WHEN $groupCol IS NULL OR $groupCol = '' THEN ? ELSE $groupCol END AS label,
                $monthSelects,
                SUM($metricCol) AS total,
                SUM(COALESCE(quantity, 0)) AS qty,
                COUNT(DISTINCT invoice_no) AS invoices
            ", [self::EMPTY_LABEL])
            ->groupBy('label')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($r) => [
                'label' => (string) $r->label,
                'months' => array_map(fn ($m) => (float) $r->{"m$m"}, range(1, 12)),
                'total' => (float) $r->total,
                'qty' => (float) $r->qty,
                'invoices' => (int) $r->invoices,
            ])
            ->values();

        return response()->json([
            'rows' => $rows,
            'hasChildren' => $depth + 1 < $dims->count(),
        ]);
    }

    /**
     * Data pivot flat untuk export Excel: satu baris per kombinasi seluruh
     * dimensi aktif (bukan per level), plus nilai per bulan + total + qty +
     * jumlah invoice. Frontend yang menyusun file .xlsx (SheetJS).
     */
    public function export(Request $request): JsonResponse
    {
        $year = (string) ($request->input('year') ?: date('Y'));

        $metric = (string) $request->input('metric', 'dpp');
        $metricCol = match ($metric) {
            'total' => 'total',
            'qty' => 'COALESCE(quantity, 0)',
            default => 'dpp',
        };

        $dims = collect(explode(',', (string) $request->input('dims', 'merk')))
            ->filter(fn ($d) => array_key_exists($d, self::DIMS))
            ->unique()->values();
        if ($dims->isEmpty()) {
            $dims = collect(['merk']);
        }

        $labelSelects = $dims
            ->map(function ($dim) {
                $col = self::DIMS[$dim];

                return "CASE WHEN $col IS NULL OR $col = '' THEN '".self::EMPTY_LABEL."' ELSE $col END AS dim_$dim";
            })
            ->implode(', ');

        $monthSelects = collect(range(1, 12))
            ->map(fn ($m) => "SUM(CASE WHEN MONTH(invoice_date) = $m THEN $metricCol ELSE 0 END) AS m$m")
            ->implode(', ');

        $groupCols = $dims->map(fn ($d) => "dim_$d")->all();

        $rows = SalesFact::query()
            ->where('tahun', $year)
            ->selectRaw("
                $labelSelects,
                $monthSelects,
                SUM($metricCol) AS total,
                SUM(COALESCE(quantity, 0)) AS qty,
                COUNT(DISTINCT invoice_no) AS invoices
            ")
            ->groupBy($groupCols)
            ->orderByRaw(implode(', ', $groupCols))
            ->get()
            ->map(fn ($r) => [
                'dims' => $dims->map(fn ($d) => (string) $r->{"dim_$d"})->all(),
                'months' => array_map(fn ($m) => (float) $r->{"m$m"}, range(1, 12)),
                'total' => (float) $r->total,
                'qty' => (float) $r->qty,
                'invoices' => (int) $r->invoices,
            ])
            ->values();

        return response()->json(['rows' => $rows, 'dims' => $dims->all()]);
    }
}
