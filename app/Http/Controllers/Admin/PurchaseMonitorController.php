<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
