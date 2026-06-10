<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SalesFact;
use App\Services\Erp\SalesSyncService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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
            'stock' => [],
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
}
