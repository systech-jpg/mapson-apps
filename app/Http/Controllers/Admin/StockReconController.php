<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AccurateSetting;
use App\Services\Accurate\AccurateService;
use App\Services\Erp\ErpStockSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Stock reconciliation: ERP (Dolibarr, erp_item_stock) vs Accurate (acc_item_stock),
 * matched on ERP product ref = Accurate item_no.
 */
class StockReconController extends Controller
{
    /**
     * Union of both systems' item keys, left-joined to each side. The Accurate side is
     * restricted to INVENTORY items with stock > 0 (non-inventory / zero-stock items are
     * excluded from the Accurate column).
     */
    private function base()
    {
        $acc = fn () => DB::table('acc_item_stock')->where('item_type', 'INVENTORY')->where('quantity', '>', 0);

        $keys = DB::table('erp_item_stock')->select('ref as k')
            ->union($acc()->select('item_no as k'));

        return DB::query()->fromSub($keys, 'k')
            ->leftJoin('erp_item_stock as e', 'e.ref', '=', 'k.k')
            ->leftJoinSub($acc(), 'a', 'a.item_no', '=', 'k.k');
    }

    private function applyFilters($q, Request $request)
    {
        $search = trim((string) $request->input('q', ''));
        $bucket = $request->string('bucket')->toString();

        $q->when($search !== '', fn ($w) => $w->where(fn ($x) => $x
            ->where('k.k', 'like', "%{$search}%")
            ->orWhere('e.label', 'like', "%{$search}%")
            ->orWhere('a.name', 'like', "%{$search}%")));

        match ($bucket) {
            'only_erp' => $q->whereNull('a.item_no'),
            'only_acc' => $q->whereNull('e.ref'),
            'match' => $q->whereNotNull('e.ref')->whereNotNull('a.item_no')->whereColumn('e.qty', '=', 'a.quantity'),
            'diff' => $q->whereNotNull('e.ref')->whereNotNull('a.item_no')->whereColumn('e.qty', '!=', 'a.quantity'),
            default => null,
        };

        return $q;
    }

    public function index(Request $request): Response
    {
        $rows = $this->applyFilters($this->base(), $request)
            ->selectRaw('k.k as code, e.label as erp_label, a.name as acc_name, e.principal as principal,
                COALESCE(e.qty, 0) as erp_qty, COALESCE(a.quantity, 0) as acc_qty,
                (COALESCE(e.qty, 0) - COALESCE(a.quantity, 0)) as selisih,
                e.ref as erp_ref, a.item_no as acc_no')
            ->orderByRaw('ABS(COALESCE(e.qty, 0) - COALESCE(a.quantity, 0)) DESC, k.k ASC')
            ->paginate(50)
            ->withQueryString();

        $agg = $this->base()->selectRaw('
            COUNT(*) as total,
            SUM(a.item_no IS NULL) as only_erp,
            SUM(e.ref IS NULL) as only_acc,
            SUM(e.ref IS NOT NULL AND a.item_no IS NOT NULL AND e.qty = a.quantity) as match_eq,
            SUM(e.ref IS NOT NULL AND a.item_no IS NOT NULL AND e.qty <> a.quantity) as diff_ne
        ')->first();

        return Inertia::render('stock-recon/index', [
            'rows' => $rows,
            'filters' => ['q' => trim((string) $request->input('q', '')), 'bucket' => $request->string('bucket')->toString()],
            'summary' => [
                'total' => (int) ($agg->total ?? 0),
                'match' => (int) ($agg->match_eq ?? 0),
                'diff' => (int) ($agg->diff_ne ?? 0),
                'only_erp' => (int) ($agg->only_erp ?? 0),
                'only_acc' => (int) ($agg->only_acc ?? 0),
            ],
            'snapshots' => [
                'erp' => DB::table('erp_item_stock')->max('snapshot_date'),
                'accurate' => DB::table('acc_item_stock')->max('snapshot_date'),
            ],
        ]);
    }

    /** Drill-down: per-item year-to-date stock card from both systems, to trace a difference. */
    public function detail(Request $request, ErpStockSyncService $erp): JsonResponse
    {
        $code = trim((string) $request->input('code'));
        $year = (int) ($request->input('year') ?: now()->year);
        $yearStart = Carbon::create($year, 1, 1)->toDateString();

        $erpRow = DB::table('erp_item_stock')->where('ref', $code)->first();
        $accRow = DB::table('acc_item_stock')->where('item_no', $code)->first();

        $to = $accRow?->snapshot_date ? Carbon::parse($accRow->snapshot_date)
            : ($erpRow?->snapshot_date ? Carbon::parse($erpRow->snapshot_date) : now());

        // ── ERP side: live movement query, windowed to the year ──
        $erpMov = $erpRow
            ? $erp->movements((int) $erpRow->erp_product_id, $to->toDateString(), $yearStart)
            : [];
        $erpCat = function ($m): string {
            if (($m->src ?? '') === 'usage') {
                return 'DO';
            }
            if (($m->dir ?? '') === 'OUT' && filled($m->do_ref ?? null)) {
                return 'DO';
            }
            if (($m->dir ?? '') === 'IN' && filled($m->gr_ref ?? null)) {
                return 'GR';
            }

            return 'OTHER';
        };
        $erpDocs = [];
        foreach ($erpMov as $m) {
            $doc = $m->do_ref ?: $m->gr_ref ?: $m->po_ref ?: $m->so_ref ?: '(tanpa dokumen)';
            $cat = $erpCat($m);
            $k = $cat.'|'.$doc;
            $erpDocs[$k] ??= ['doc' => $doc, 'category' => $cat, 'qty' => 0.0, 'lines' => 0, 'date' => ''];
            $erpDocs[$k]['qty'] += (float) $m->qty;
            $erpDocs[$k]['lines']++;
            $erpDocs[$k]['date'] = max($erpDocs[$k]['date'], substr((string) $m->dt, 0, 10));
        }
        $erpDocs = array_values($erpDocs);

        // ── Accurate side: document-reconstructed per-item ledger (acc_stock_movements) ──
        $accMov = DB::table('acc_stock_movements')
            ->where('item_no', $code)
            ->whereBetween('trans_date', [$yearStart, $to->toDateString()])
            ->get(['doc_type', 'doc_number', 'trans_date', 'qty']);
        $accSynced = DB::table('acc_stock_movements')->max('synced_at');

        $accCat = fn (string $t): string => match ($t) {
            'DO' => 'DO', 'SI' => 'INV', 'RI', 'PI', 'SR' => 'GR', default => 'OTHER',
        };
        $accDocsMap = [];
        foreach ($accMov as $m) {
            $doc = $m->doc_number ?: '(tanpa dokumen)';
            $accDocsMap[$doc] ??= ['doc' => $doc, 'category' => $accCat($m->doc_type), 'type' => $m->doc_type, 'qty' => 0.0, 'lines' => 0, 'date' => ''];
            $accDocsMap[$doc]['qty'] += (float) $m->qty;
            $accDocsMap[$doc]['lines']++;
            $d = substr((string) $m->trans_date, 0, 10);
            if ($d && ($accDocsMap[$doc]['date'] === '' || $d < $accDocsMap[$doc]['date'])) {
                $accDocsMap[$doc]['date'] = $d;
            }
        }
        $accDocs = array_values($accDocsMap);

        // Kartu stok Accurate: per document, chronological, running balance anchored to live qty.
        $card = $accDocs;
        usort($card, fn ($a, $b) => strcmp((string) $a['date'], (string) $b['date']));
        $accOpening = (float) ($accRow->quantity ?? 0) - array_sum(array_map(fn ($d) => $d['qty'], $card));
        $run = $accOpening;
        $cardRows = [];
        foreach ($card as $c) {
            $run += $c['qty'];
            $cardRows[] = [
                'date' => $c['date'] ?: null,
                'number' => $c['doc'],
                'type' => $c['type'],
                'masuk' => $c['qty'] > 0 ? $c['qty'] : 0,
                'keluar' => $c['qty'] < 0 ? -$c['qty'] : 0,
                'lines' => $c['lines'],
                'saldo' => round($run, 4),
            ];
        }

        // DO per-document match: ERP (expedition + SJ) vs Accurate DO, by document number.
        $erpDoByDoc = [];
        foreach ($erpDocs as $d) {
            if ($d['category'] === 'DO') {
                $erpDoByDoc[$d['doc']] = ['qty' => abs($d['qty']), 'date' => $d['date']];
            }
        }
        $accDoByDoc = [];
        foreach ($accDocs as $d) {
            if ($d['type'] === 'DO') {
                $accDoByDoc[$d['doc']] = ['qty' => abs($d['qty']), 'date' => $d['date']];
            }
        }
        $doMatch = [];
        foreach (array_unique(array_merge(array_keys($erpDoByDoc), array_keys($accDoByDoc))) as $doc) {
            $e = isset($erpDoByDoc[$doc]) ? $erpDoByDoc[$doc]['qty'] : null;
            $a = isset($accDoByDoc[$doc]) ? $accDoByDoc[$doc]['qty'] : null;
            $date = max($erpDoByDoc[$doc]['date'] ?? '', $accDoByDoc[$doc]['date'] ?? '');
            $status = ($e !== null && $a !== null) ? (abs($e - $a) < 0.0001 ? 'match' : 'diff') : ($e !== null ? 'erp_only' : 'acc_only');
            $doMatch[] = ['doc' => $doc, 'erp' => $e, 'acc' => $a, 'date' => $date ?: null, 'ym' => substr((string) $date, 0, 7), 'status' => $status];
        }
        usort($doMatch, fn ($x, $y) => strcmp((string) ($y['date'] ?? ''), (string) ($x['date'] ?? '')));

        return response()->json([
            'code' => $code,
            'label' => $erpRow->label ?? $accRow->name ?? $code,
            'year' => $year,
            'erp' => [
                'qty' => (float) ($erpRow->qty ?? 0),
                'snapshot' => $erpRow->snapshot_date ?? null,
                'exists' => (bool) $erpRow,
                'docs' => $erpDocs,
            ],
            'accurate' => [
                'qty' => (float) ($accRow->quantity ?? 0),
                'snapshot' => $accRow->snapshot_date ?? null,
                'exists' => (bool) $accRow,
                'docs' => $accDocs,
                'movements_synced' => $accSynced,
                'has_movements' => count($accMov) > 0,
                'card' => [
                    'opening' => round($accOpening, 4),
                    'period_from' => $yearStart,
                    'rows' => $cardRows,
                ],
            ],
            'selisih' => (float) ($erpRow->qty ?? 0) - (float) ($accRow->quantity ?? 0),
            'do_match' => $doMatch,
        ]);
    }

    /** Export the (filtered) reconciliation to .xls. */
    public function export(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $rows = $this->applyFilters($this->base(), $request)
            ->selectRaw('k.k as code, e.label as erp_label, a.name as acc_name, e.principal as principal,
                COALESCE(e.qty, 0) as erp_qty, COALESCE(a.quantity, 0) as acc_qty,
                (COALESCE(e.qty, 0) - COALESCE(a.quantity, 0)) as selisih, e.ref as erp_ref, a.item_no as acc_no')
            ->orderByRaw('ABS(COALESCE(e.qty, 0) - COALESCE(a.quantity, 0)) DESC')
            ->limit(20000)->get();

        $esc = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES);
        $num = fn ($v) => number_format((float) $v, 2, ',', '.');
        $hdr = 'background:#1f2937;color:#fff;font-weight:bold;text-align:center;';
        $html = '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Calibri,Arial;font-size:12px;">';
        $html .= '<tr style="'.$hdr.'"><th>No</th><th>Kode</th><th>Nama</th><th>Principal</th><th>Qty ERP</th><th>Qty Accurate</th><th>Selisih</th><th>Status</th></tr>';
        foreach ($rows as $i => $r) {
            $status = $r->erp_ref === null ? 'Hanya Accurate' : ($r->acc_no === null ? 'Hanya ERP' : ((float) $r->selisih === 0.0 ? 'Cocok' : 'Beda'));
            $html .= '<tr>'
                .'<td style="text-align:center;">'.($i + 1).'</td>'
                .'<td>'.$esc($r->code).'</td>'
                .'<td>'.$esc($r->erp_label ?: $r->acc_name).'</td>'
                .'<td>'.$esc($r->principal).'</td>'
                .'<td style="text-align:right;">'.$num($r->erp_qty).'</td>'
                .'<td style="text-align:right;">'.$num($r->acc_qty).'</td>'
                .'<td style="text-align:right;">'.$num($r->selisih).'</td>'
                .'<td>'.$status.'</td>'
                .'</tr>';
        }
        $html .= '</table>';
        $doc = '<html><head><meta charset="UTF-8"></head><body><h3>Rekon Stok ERP vs Accurate</h3>'.$html.'</body></html>';

        return response($doc, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="rekon-stok-erp-vs-accurate.xls"',
        ]);
    }
}
