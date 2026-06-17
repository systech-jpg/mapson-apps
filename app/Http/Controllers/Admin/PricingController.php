<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Currency;
use App\Models\PricingApproval;
use App\Models\PricingParameter;
use App\Models\Product;
use App\Support\PricingCalculator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class PricingController extends Controller
{
    /** Modifier fields snapshotted into pricing_approvals.new_values and merged on approval. */
    private const FIELDS = [
        'currency_code', 'base_price_valas', 'principal_disc_pct', 'bm_nominal', 'tax_nominal',
        'import_fee_nominal', 'opex_pct', 'profit_pct', 'comm_pct', 'ship_sales_pct',
    ];

    /** The interactive pricing grid. */
    public function index(): Response
    {
        $pending = PricingApproval::where('status', 'pending')->get()->keyBy('product_id');

        $products = Product::orderBy('product_name')->get()->map(fn (Product $p) => [
            'id' => $p->id,
            'sku_code' => $p->sku_code,
            'product_name' => $p->product_name,
            'principal_name' => $p->principal_name,
            'currency_code' => $p->currency_code,
            'base_price_valas' => (float) $p->base_price_valas,
            'principal_disc_pct' => (float) $p->principal_disc_pct,
            'bm_nominal' => (float) $p->bm_nominal,
            'tax_nominal' => (float) $p->tax_nominal,
            'import_fee_nominal' => (float) $p->import_fee_nominal,
            'opex_pct' => (float) $p->opex_pct,
            'profit_pct' => (float) $p->profit_pct,
            'comm_pct' => (float) $p->comm_pct,
            'ship_sales_pct' => (float) $p->ship_sales_pct,
            'final_price' => (float) $p->final_price,
            'pending' => $pending->has($p->id),
        ]);

        return Inertia::render('pricing/index', [
            'products' => $products,
            'currencies' => Currency::orderBy('code')->get(['code', 'name', 'rate_to_idr']),
            'parameters' => PricingParameter::where('is_active', true)->orderBy('sort_order')->get(['id', 'name']),
            'pendingCount' => $pending->count(),
            'canApprove' => request()->user()->hasMenuAccess('pricing-approvals', 'view'),
        ]);
    }

    /** Submit a proposed pricing change for approval. */
    public function storeApproval(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'exists:products,id'],
            'parameter_id' => ['nullable', 'exists:pricing_parameters,id'],
            'currency_code' => ['nullable', 'exists:currencies,code'],
            'base_price_valas' => ['required', 'numeric', 'min:0'],
            'principal_disc_pct' => ['required', 'numeric'],
            'bm_nominal' => ['required', 'numeric', 'min:0'],
            'tax_nominal' => ['required', 'numeric', 'min:0'],
            'import_fee_nominal' => ['required', 'numeric', 'min:0'],
            'opex_pct' => ['required', 'numeric'],
            'profit_pct' => ['required', 'numeric'],
            'comm_pct' => ['required', 'numeric'],
            'ship_sales_pct' => ['required', 'numeric'],
        ]);

        $product = Product::findOrFail($data['product_id']);
        if ($product->approvals()->where('status', 'pending')->exists()) {
            return back()->with('error', 'Produk ini sudah punya pengajuan harga yang menunggu persetujuan.');
        }

        $rate = $data['currency_code'] ? (float) optional(Currency::find($data['currency_code']))->rate_to_idr : 0;
        $calc = PricingCalculator::compute($data, $rate);

        PricingApproval::create([
            'product_id' => $product->id,
            'parameter_id' => $data['parameter_id'] ?? null,
            'old_price' => $product->final_price,
            'new_price' => $calc['final_pricelist'],
            'new_values' => Arr::only($data, self::FIELDS),
            'status' => 'pending',
            'requested_by' => $request->user()->id,
        ]);

        return back()->with('success', "Pengajuan harga {$product->product_name} dikirim untuk persetujuan.");
    }

    /** Approval queue for managers. */
    public function approvals(): Response
    {
        $rows = PricingApproval::with(['product:id,sku_code,product_name,principal_name', 'parameter:id,name', 'requester:id,name'])
            ->where('status', 'pending')
            ->orderBy('created_at')
            ->get();

        return Inertia::render('pricing/approval', ['approvals' => $rows]);
    }

    /** Approve → merge the snapshot into the master product + lock the new final price. */
    public function approve(Request $request, PricingApproval $approval): RedirectResponse
    {
        abort_unless($approval->status === 'pending', 409, 'Pengajuan ini sudah diputuskan.');

        DB::transaction(function () use ($approval, $request) {
            $approval->loadMissing('product');
            $approval->product->update(Arr::only($approval->new_values, self::FIELDS) + ['final_price' => $approval->new_price]);
            $approval->update(['status' => 'approved', 'decided_by' => $request->user()->id, 'decided_at' => now()]);
        });

        return back()->with('success', 'Harga disetujui & master produk diperbarui.');
    }

    public function reject(Request $request, PricingApproval $approval): RedirectResponse
    {
        abort_unless($approval->status === 'pending', 409, 'Pengajuan ini sudah diputuskan.');
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);

        $approval->update([
            'status' => 'rejected',
            'note' => $data['note'] ?? null,
            'decided_by' => $request->user()->id,
            'decided_at' => now(),
        ]);

        return back()->with('success', 'Pengajuan harga ditolak.');
    }
}
