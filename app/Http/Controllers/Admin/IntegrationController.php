<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SalesFact;
use App\Services\Erp\ErpStockSyncService;
use App\Services\Erp\SalesSyncService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class IntegrationController extends Controller
{
    public function __construct(protected SalesSyncService $salesSync)
    {
    }

    public function index(Request $request): Response
    {
        $lastSynced = $this->salesSync->lastSyncedAt();
        $search = $request->string('search')->toString();

        $salesQuery = SalesFact::query()
            ->when($search, fn ($q) => $q->where(function ($w) use ($search) {
                $like = "%{$search}%";
                $w->where('invoice_no', 'like', $like)
                    ->orWhere('customer', 'like', $like)
                    ->orWhere('bill_to', 'like', $like)
                    ->orWhere('part_number', 'like', $like)
                    ->orWhere('description', 'like', $like)
                    ->orWhere('sales', 'like', $like)
                    ->orWhere('nomor_faktur', 'like', $like);
            }));

        return Inertia::render('integration/index', [
            'sales' => (clone $salesQuery)
                ->orderByDesc('invoice_date')
                ->orderByDesc('id')
                ->paginate(50)
                ->withQueryString(),
            'salesTotal' => SalesFact::count(),
            'filters' => ['search' => $search],
            'lastSyncedAt' => $lastSynced?->format('d M Y H:i'),
            'erpBaseUrl' => config('erp.base_url') ?: null,
        ]);
    }

    /** ERP stock snapshot page (separate from Sales so paginators don't clash). */
    public function stock(Request $request): Response
    {
        $stockSearch = $request->string('search')->toString();

        $erpStock = DB::table('erp_item_stock')
            ->when($stockSearch !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('ref', 'like', "%{$stockSearch}%")->orWhere('label', 'like', "%{$stockSearch}%")->orWhere('principal', 'like', "%{$stockSearch}%")))
            ->orderBy('ref')
            ->paginate(50)
            ->withQueryString();

        return Inertia::render('integration/stock', [
            'erpStock' => $erpStock,
            'stockMeta' => [
                'count' => DB::table('erp_item_stock')->count(),
                'lastSync' => DB::table('erp_item_stock')->max('synced_at'),
                'snapshotDate' => DB::table('erp_item_stock')->max('snapshot_date'),
                'today' => now()->toDateString(),
            ],
            'filters' => ['search' => $stockSearch],
        ]);
    }

    public function syncSales(): RedirectResponse
    {
        try {
            $count = $this->salesSync->sync();
        } catch (Throwable $e) {
            report($e);

            return back()->with('error', 'Gagal sinkronisasi dari ERP: '.$e->getMessage());
        }

        return back()->with('success', "Sinkronisasi sales selesai. {$count} baris dimuat dari ERP.");
    }

    /** Pull the ERP stock snapshot as of a chosen date (truncate + insert). */
    public function syncStock(Request $request, ErpStockSyncService $stockSync): RedirectResponse
    {
        $data = $request->validate(['as_of' => ['nullable', 'date']]);

        try {
            $r = $stockSync->sync($data['as_of'] ?? null);
        } catch (Throwable $e) {
            report($e);

            return back()->with('error', 'Gagal tarik stok ERP: '.$e->getMessage());
        }

        return back()->with('success', "Stok ERP ditarik — {$r['items']} item (per {$r['as_of']}).");
    }
}
