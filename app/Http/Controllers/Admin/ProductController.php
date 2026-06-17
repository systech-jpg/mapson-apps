<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Currency;
use App\Models\Product;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Finance → Data Produk. Master product identity. Manual entry for now; will be fed
 * from the ERP product catalog later.
 */
class ProductController extends Controller
{
    public function index(Request $request): Response
    {
        $search = trim((string) $request->input('search', ''));

        $products = Product::query()
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('product_name', 'like', "%{$search}%")
                ->orWhere('sku_code', 'like', "%{$search}%")
                ->orWhere('principal_name', 'like', "%{$search}%")))
            ->orderBy('product_name')
            ->paginate(20)
            ->withQueryString();

        return Inertia::render('finance/products', [
            'products' => $products,
            'filters' => ['search' => $search],
            'currencies' => Currency::orderBy('code')->get(['code', 'name', 'rate_to_idr']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'sku_code' => ['required', 'string', 'max:255', 'unique:products,sku_code'],
            'product_name' => ['required', 'string', 'max:255'],
            'principal_name' => ['nullable', 'string', 'max:255'],
            'currency_code' => ['nullable', 'exists:currencies,code'],
        ]);

        Product::create($data);

        return back()->with('success', 'Produk ditambahkan.');
    }

    public function destroy(Product $product): RedirectResponse
    {
        $product->delete();

        return back()->with('success', 'Produk dihapus.');
    }
}
