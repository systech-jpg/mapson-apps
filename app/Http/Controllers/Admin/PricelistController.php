<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PricingHospital;
use App\Models\PricingPricelist;
use App\Models\PricingPrincipal;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Pricelist = the currently-active approved price versions (effective-dated). Each row shows its
 * masa berlaku; the history dialog lists every version with its validity window and attachments.
 */
class PricelistController extends Controller
{
    public function index(Request $request): Response
    {
        $search = trim((string) $request->input('q', ''));
        $principalId = $request->string('principal')->toString();
        $hospital = $request->string('hospital')->toString();   // '' = all | 'base' = null | id

        $page = PricingPricelist::where('is_active', true)
            ->with(['product', 'product.principal:id,name', 'price', 'profile:id,name', 'hospital:id,name', 'approver:id,name'])
            ->when($principalId !== '', fn ($q) => $q->whereHas('product', fn ($w) => $w->where('principal_id', $principalId)))
            ->when($hospital === 'base', fn ($q) => $q->whereNull('hospital_id'))
            ->when($hospital !== '' && $hospital !== 'base', fn ($q) => $q->where('hospital_id', $hospital))
            ->when($search !== '', fn ($q) => $q->whereHas('product', fn ($w) => $w
                ->where('sku_code', 'like', "%{$search}%")
                ->orWhere('product_name', 'like', "%{$search}%")))
            ->orderByDesc('effective_from')
            ->paginate(30)
            ->withQueryString();

        // Preload every version per (product, profile, hospital) on this page for history.
        $key = fn (PricingPricelist $e) => $e->product_id.'-'.$e->profile_id.'-'.(int) $e->hospital_id;
        $triples = $page->getCollection()->map(fn ($e) => [$e->product_id, $e->profile_id, $e->hospital_id]);
        $histories = $triples->isEmpty() ? collect() : PricingPricelist::where(function ($q) use ($triples) {
            foreach ($triples as [$productId, $profileId, $hospitalId]) {
                $q->orWhere(fn ($w) => $w->where('product_id', $productId)->where('profile_id', $profileId)->where('hospital_id', $hospitalId));
            }
        })
            ->with(['approver:id,name', 'submission.submitter:id,name', 'submission.attachments'])
            ->orderByDesc('effective_from')->orderByDesc('id')
            ->get()
            ->groupBy($key);

        $page->getCollection()->transform(fn (PricingPricelist $e) => $this->serialize($e, $histories[$key($e)] ?? collect()));

        return Inertia::render('pricelist/index', [
            'rows' => $page,
            'filters' => ['q' => $search, 'principal' => $principalId, 'hospital' => $hospital],
            'principals' => PricingPrincipal::orderBy('name')->get(['id', 'name']),
            'hospitals' => PricingHospital::whereIn('id', PricingPricelist::whereNotNull('hospital_id')->distinct()->pluck('hospital_id'))
                ->orderBy('name')->get(['id', 'name']),
        ]);
    }

    private function serialize(PricingPricelist $e, Collection $history): array
    {
        return [
            'id' => $e->id,
            'sku_code' => $e->product?->sku_code,
            'product_name' => $e->product?->product_name,
            'principal' => $e->product?->principal?->name,
            'profile' => $e->profile?->name,
            'hospital' => $e->hospital?->name,   // null = semua RS
            'pricelist' => (float) $e->pricelist,
            'harga_beli' => (float) ($e->breakdown['a_principal_idr'] ?? 0),   // A: Pricelist Principal IDR
            'effective_from' => $e->effective_from?->format('Y-m-d'),
            'effective_to' => $e->effective_to?->format('Y-m-d'),
            'approved_at' => $e->approved_at?->format('Y-m-d H:i'),
            'approved_by' => $e->approver?->name,
            'detail' => $this->detailOf($e),
            'history' => $history->map(fn (PricingPricelist $v) => [
                'pricelist' => (float) $v->pricelist,
                'effective_from' => $v->effective_from?->format('Y-m-d'),
                'effective_to' => $v->effective_to?->format('Y-m-d'),
                'is_active' => (bool) $v->is_active,
                'approved_at' => $v->approved_at?->format('Y-m-d H:i'),
                'approved_by' => $v->approver?->name,
                'submitted_at' => $v->submission?->submitted_at?->format('Y-m-d H:i'),
                'submitted_by' => $v->submission?->submitter?->name,
                'note' => $v->submission?->note,
                'decision_note' => $v->submission?->decision_note,
                'attachments' => ($v->submission?->attachments ?? collect())->map(fn ($a) => [
                    'id' => $a->id, 'kind' => $a->kind, 'name' => $a->original_name,
                ])->values(),
            ])->values(),
        ];
    }

    /** Full breakdown (inputs + computed) for the preview dialog — mirrors the Pricing Engine detail. */
    private function detailOf(PricingPricelist $e): array
    {
        $p = $e->product;
        $pr = $e->price;

        return [
            'brand' => $p?->brand,
            'category' => array_values(array_filter([$p?->cat1, $p?->cat2, $p?->cat3, $p?->cat4])),
            'product_type' => $p?->product_type,
            'currency_code' => $p?->currency_code,
            'price_principle' => (float) ($p?->price_principle ?? 0),
            'disc_principle_pct' => (float) ($p?->disc_principle_pct ?? 0),
            'kurs' => (float) ($p?->kurs ?? 0),
            'qty_beli' => (float) ($p?->qty_beli ?? 0), 'uom_beli' => $p?->uom_beli,
            'qty_jual' => (float) ($p?->qty_jual ?? 0), 'uom_jual' => $p?->uom_jual,
            'bm_pct' => (float) ($p?->bm_pct ?? 0), 'pph22_pct' => (float) ($p?->pph22_pct ?? 0),
            'ppn_pct' => (float) ($p?->ppn_pct ?? 0), 'shipment_pct' => (float) ($p?->shipment_pct ?? 0),
            'ops_pct' => (float) ($pr?->ops_pct ?? 0), 'profit_pct' => (float) ($pr?->profit_pct ?? 0),
            'komisi_pct' => (float) ($pr?->komisi_pct ?? 0), 'event_pct' => (float) ($pr?->event_pct ?? 0),
            'lainnya_pct' => (float) ($pr?->lainnya_pct ?? 0), 'buffer_pct' => (float) ($pr?->buffer_pct ?? 0),
            'breakdown' => $e->breakdown,
        ];
    }

    /** Export the (filtered) active pricelist to .xls. full=1 → Pricing-Engine-style breakdown. */
    public function export(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $search = trim((string) $request->input('q', ''));
        $principalId = $request->string('principal')->toString();
        $hospital = $request->string('hospital')->toString();
        $full = $request->boolean('full');

        $rows = PricingPricelist::where('is_active', true)
            ->with(['product:id,principal_id,sku_code,product_name', 'product.principal:id,name', 'profile:id,name', 'hospital:id,name'])
            ->when($principalId !== '', fn ($q) => $q->whereHas('product', fn ($w) => $w->where('principal_id', $principalId)))
            ->when($hospital === 'base', fn ($q) => $q->whereNull('hospital_id'))
            ->when($hospital !== '' && $hospital !== 'base', fn ($q) => $q->where('hospital_id', $hospital))
            ->when($search !== '', fn ($q) => $q->whereHas('product', fn ($w) => $w
                ->where('sku_code', 'like', "%{$search}%")->orWhere('product_name', 'like', "%{$search}%")))
            ->orderBy('product_id')->limit(20000)->get();

        $esc = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES);
        $num = fn ($v) => number_format((float) $v, 2, ',', '.');
        $hdr = 'background:#1f2937;color:#fff;font-weight:bold;text-align:center;';

        $cols = $full
            ? ['Principal', 'Kode', 'Deskripsi', 'Profil', 'RS', 'Berlaku Dari', 'Sampai',
                'A: Principal IDR', 'BM Rp', 'PPh22 Rp', 'PPN Rp', 'Ship Rp', 'Total Cost',
                'Harga Masuk Gudang', 'Harga Gudang', 'Harga Bawah', 'Harga Jual (Pricelist)']
            : ['Principal', 'Kode', 'Deskripsi', 'Profil', 'RS', 'Harga Beli', 'Harga Jual'];

        $html = '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Calibri,Arial;font-size:12px;">';
        $html .= '<tr style="'.$hdr.'">'.collect($cols)->map(fn ($c) => '<th>'.$esc($c).'</th>')->implode('').'</tr>';

        foreach ($rows as $r) {
            $b = $r->breakdown ?? [];
            $rs = $r->hospital?->name ?? 'Semua RS';
            $base = ['<td>'.$esc($r->product?->principal?->name).'</td>',
                '<td>'.$esc($r->product?->sku_code).'</td>',
                '<td>'.$esc($r->product?->product_name).'</td>',
                '<td>'.$esc($r->profile?->name).'</td>',
                '<td>'.$esc($rs).'</td>'];

            if ($full) {
                $cells = array_merge($base, [
                    '<td>'.$esc($r->effective_from?->format('Y-m-d')).'</td>',
                    '<td>'.$esc($r->effective_to?->format('Y-m-d') ?? 'sekarang').'</td>',
                    ...array_map(fn ($k) => '<td style="text-align:right;">'.$num($b[$k] ?? 0).'</td>',
                        ['a_principal_idr', 'bm', 'pph22', 'ppn', 'shipment', 'b_total_cost', 'c_warehouse', 'e_harga_gudang', 'g_bottom']),
                    '<td style="text-align:right;">'.$num($r->pricelist).'</td>',
                ]);
            } else {
                $cells = array_merge($base, [
                    '<td style="text-align:right;">'.$num($b['a_principal_idr'] ?? 0).'</td>',
                    '<td style="text-align:right;">'.$num($r->pricelist).'</td>',
                ]);
            }
            $html .= '<tr>'.implode('', $cells).'</tr>';
        }
        $html .= '</table>';

        $doc = '<html><head><meta charset="UTF-8"></head><body><h3>Pricelist</h3>'.$html.'</body></html>';

        return response($doc, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="pricelist'.($full ? '-full' : '').'.xls"',
        ]);
    }
}
