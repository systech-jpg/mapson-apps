<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
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

        $page = PricingPricelist::where('is_active', true)
            ->with(['product:id,principal_id,sku_code,product_name', 'product.principal:id,name', 'profile:id,name', 'approver:id,name'])
            ->when($principalId !== '', fn ($q) => $q->whereHas('product', fn ($w) => $w->where('principal_id', $principalId)))
            ->when($search !== '', fn ($q) => $q->whereHas('product', fn ($w) => $w
                ->where('sku_code', 'like', "%{$search}%")
                ->orWhere('product_name', 'like', "%{$search}%")))
            ->orderByDesc('effective_from')
            ->paginate(30)
            ->withQueryString();

        // Preload every version for the products on this page (one query), grouped for history.
        $pairs = $page->getCollection()->map(fn ($e) => [$e->product_id, $e->profile_id]);
        $histories = $pairs->isEmpty() ? collect() : PricingPricelist::where(function ($q) use ($pairs) {
            foreach ($pairs as [$productId, $profileId]) {
                $q->orWhere(fn ($w) => $w->where('product_id', $productId)->where('profile_id', $profileId));
            }
        })
            ->with(['approver:id,name', 'submission.submitter:id,name', 'submission.attachments'])
            ->orderByDesc('effective_from')->orderByDesc('id')
            ->get()
            ->groupBy(fn ($e) => $e->product_id.'-'.$e->profile_id);

        $page->getCollection()->transform(fn (PricingPricelist $e) => $this->serialize($e, $histories[$e->product_id.'-'.$e->profile_id] ?? collect()));

        return Inertia::render('pricelist/index', [
            'rows' => $page,
            'filters' => ['q' => $search, 'principal' => $principalId],
            'principals' => PricingPrincipal::orderBy('name')->get(['id', 'name']),
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
            'pricelist' => (float) $e->pricelist,
            'effective_from' => $e->effective_from?->format('Y-m-d'),
            'effective_to' => $e->effective_to?->format('Y-m-d'),
            'approved_at' => $e->approved_at?->format('Y-m-d H:i'),
            'approved_by' => $e->approver?->name,
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
}
