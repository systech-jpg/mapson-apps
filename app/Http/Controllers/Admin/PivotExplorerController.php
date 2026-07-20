<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SalesFact;
use App\Support\SalesDimensions as SD;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Pivot Explorer — self-service pivot over sales_facts. The user drags dimensions
 * into Rows/Columns/Filters and measures into Values; pivot() computes one flat
 * grouped result in SQL and the frontend arranges the cross-tab client-side.
 *
 * Dimension/measure whitelist lives in {@see SD} (shared with the drilldown).
 */
class PivotExplorerController extends Controller
{
    /** Max grouped rows returned before we flag truncation (protects the browser). */
    protected const ROW_CAP = 4000;

    protected const EXPORT_CAP = 20000;

    public function index(Request $request): Response
    {
        $canSensitive = (bool) $request->user()?->canSeeSensitiveSales();

        $dimensions = [];
        foreach (SD::DIMS as $key => [$group, $label, , $sensitive]) {
            if ($sensitive && ! $canSensitive) {
                continue;
            }
            $dimensions[] = ['key' => $key, 'label' => $label, 'group' => $group];
        }

        $measures = [];
        foreach (SD::MEASURES as $key => [$label, , $format]) {
            $measures[] = ['key' => $key, 'label' => $label, 'format' => $format];
        }

        return Inertia::render('analytics/explorer', [
            'dimensions' => $dimensions,
            'measures' => $measures,
            'years' => SalesFact::query()
                ->whereNotNull('tahun')->where('tahun', '!=', '')
                ->distinct()->orderByDesc('tahun')->pluck('tahun')->values(),
            'canSeeSensitive' => $canSensitive,
            'hasData' => SalesFact::query()->exists(),
        ]);
    }

    /** One flat grouped result: rows-then-cols dims as keys[], measures as vals[]. */
    public function pivot(Request $request): JsonResponse
    {
        [$rows, $cols, $values] = $this->readConfig($request);

        if (empty($values)) {
            return response()->json(['error' => 'Pilih minimal satu Nilai (metrik).'], 422);
        }

        $dims = array_merge($rows, $cols); // rows first, then cols
        [$q, $capped, $data] = $this->runPivot($request, $dims, $values, self::ROW_CAP);

        return response()->json([
            'rowDims' => count($rows),
            'colDims' => count($cols),
            'values' => array_map(fn ($k) => ['key' => $k, 'label' => SD::MEASURES[$k][0], 'format' => SD::MEASURES[$k][2]], $values),
            'rows' => $data,
            'truncated' => $capped,
        ]);
    }

    /** Flat dump (all active dims as columns) for the SheetJS export on the client. */
    public function export(Request $request): JsonResponse
    {
        [$rows, $cols, $values] = $this->readConfig($request);
        $dims = array_merge($rows, $cols);

        if (empty($values)) {
            return response()->json(['error' => 'Pilih minimal satu Nilai (metrik).'], 422);
        }

        [, $capped, $data] = $this->runPivot($request, $dims, $values, self::EXPORT_CAP);

        return response()->json([
            'dims' => array_map(fn ($k) => ['key' => $k, 'label' => SD::dimLabel($k)], $dims),
            'values' => array_map(fn ($k) => ['key' => $k, 'label' => SD::MEASURES[$k][0], 'format' => SD::MEASURES[$k][2]], $values),
            'rows' => $data,
            'truncated' => $capped,
        ]);
    }

    /**
     * @return array{0: string[], 1: string[], 2: string[]} rows, cols, values (validated & sensitive-filtered)
     */
    protected function readConfig(Request $request): array
    {
        $canSensitive = (bool) $request->user()?->canSeeSensitiveSales();

        $cleanDims = function ($raw) use ($canSensitive) {
            return collect(is_array($raw) ? $raw : [])
                ->map(fn ($k) => (string) $k)
                ->filter(fn ($k) => SD::isDim($k) && ! (SD::isSensitive($k) && ! $canSensitive))
                ->unique()->values()->all();
        };

        $rows = $cleanDims($request->input('rows'));
        $cols = $cleanDims($request->input('cols'));
        // A dim can't be in both rows and cols — rows win.
        $cols = array_values(array_diff($cols, $rows));

        $values = collect(is_array($request->input('values')) ? $request->input('values') : [])
            ->map(fn ($k) => (string) $k)
            ->filter(fn ($k) => SD::isMeasure($k))
            ->unique()->values()->all();

        return [$rows, $cols, $values];
    }

    /**
     * Build & run the grouped query.
     *
     * @param  string[]  $dims  ordered dimension keys (rows then cols)
     * @param  string[]  $values  measure keys
     * @return array{0: \Illuminate\Database\Eloquent\Builder, 1: bool, 2: array<int, array{keys: string[], vals: float[]}>}
     */
    protected function runPivot(Request $request, array $dims, array $values, int $cap): array
    {
        $q = SalesFact::query();
        $this->applyFilters($request, $q);

        $selects = [];
        $groupAliases = [];
        foreach ($dims as $i => $key) {
            $selects[] = SD::dimSelect($key, "d$i");
            $groupAliases[] = "d$i";
        }
        foreach ($values as $j => $key) {
            $selects[] = SD::MEASURES[$key][1]." AS v$j";
        }

        $q->selectRaw(implode(', ', $selects));
        if ($groupAliases) {
            $q->groupByRaw(implode(', ', $groupAliases));
        }
        if (! empty($values)) {
            $q->orderByRaw('v0 DESC'); // largest first (MySQL sorts NULL last on DESC)
        }
        $q->limit($cap + 1);

        $raw = $q->get();
        $capped = $raw->count() > $cap;
        if ($capped) {
            $raw = $raw->take($cap);
        }

        $data = $raw->map(function ($r) use ($dims, $values) {
            return [
                'keys' => array_map(fn ($i) => (string) $r->{"d$i"}, array_keys($dims)),
                'vals' => array_map(fn ($j) => (float) ($r->{"v$j"} ?? 0), array_keys($values)),
            ];
        })->all();

        return [$q, $capped, $data];
    }

    /** Apply the Filter-zone dimension filters + optional invoice-date range. */
    protected function applyFilters(Request $request, $q): void
    {
        $filters = $request->input('filters', []);
        if (is_array($filters)) {
            $canSensitive = (bool) $request->user()?->canSeeSensitiveSales();
            foreach ($filters as $key => $vals) {
                $key = (string) $key;
                if (! SD::isDim($key) || (SD::isSensitive($key) && ! $canSensitive)) {
                    continue;
                }
                $vals = array_values(array_filter(is_array($vals) ? $vals : [$vals], fn ($v) => $v !== null && $v !== ''));
                if (empty($vals)) {
                    continue;
                }
                $sql = SD::dimSql($key);
                $q->where(function ($w) use ($vals, $sql) {
                    foreach ($vals as $v) {
                        if ($v === SD::EMPTY_LABEL) {
                            $w->orWhereRaw("($sql) IS NULL OR ($sql) = ''");
                        } else {
                            $w->orWhereRaw("($sql) = ?", [$v]);
                        }
                    }
                });
            }
        }

        if ($request->filled('date_from')) {
            $q->whereDate('invoice_date', '>=', $request->date('date_from'));
        }
        if ($request->filled('date_to')) {
            $q->whereDate('invoice_date', '<=', $request->date('date_to'));
        }
    }

    /**
     * Distinct values of one dimension (for the Filter-zone value picker).
     * Lightweight: capped, ordered, sentinel-aware.
     */
    public function fieldValues(Request $request): JsonResponse
    {
        $key = (string) $request->input('dim');
        $canSensitive = (bool) $request->user()?->canSeeSensitiveSales();
        if (! SD::isDim($key) || (SD::isSensitive($key) && ! $canSensitive)) {
            return response()->json(['values' => []]);
        }

        $expr = SD::dimSelect($key, 'val');
        $values = SalesFact::query()
            ->selectRaw($expr)
            ->groupByRaw('val')
            ->orderByRaw('val')
            ->limit(500)
            ->pluck('val')
            ->map(fn ($v) => (string) $v)
            ->values();

        return response()->json(['values' => $values]);
    }
}
