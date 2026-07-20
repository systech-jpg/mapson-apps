<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SalesFact;
use App\Models\SyncLog;
use App\Services\Erp\ErpStockSyncService;
use App\Services\Erp\SalesSyncService;
use App\Support\InventorySnapshot;
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

        // Halaman ini menampilkan "stok terkini" = snapshot ERP terakhir. Dibatasi ke item
        // bersaldo (erpStocked) agar isinya sama seperti tabel erp_item_stock dahulu.
        $erpStock = InventorySnapshot::erpStocked()
            ->when($stockSearch !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('ref', 'like', "%{$stockSearch}%")->orWhere('label', 'like', "%{$stockSearch}%")->orWhere('principal', 'like', "%{$stockSearch}%")))
            ->orderBy('ref')
            ->paginate(50)
            ->withQueryString();

        return Inertia::render('integration/stock', [
            'erpStock' => $erpStock,
            'stockMeta' => [
                'count' => InventorySnapshot::erpStocked()->count(),
                'lastSync' => InventorySnapshot::erp()->max('synced_at'),
                'snapshotDate' => InventorySnapshot::latestDate(InventorySnapshot::ERP),
                'today' => now()->toDateString(),
            ],
            'filters' => ['search' => $stockSearch],
        ]);
    }

    public function syncSales(Request $request): RedirectResponse
    {
        $start = microtime(true);
        try {
            $count = $this->salesSync->sync();
        } catch (Throwable $e) {
            report($e);
            SyncLog::record('erp', 'ERP sales_facts', 'failed', null, $e->getMessage(), (int) round((microtime(true) - $start) * 1000), 'manual', $request->user()->id);

            return back()->with('error', 'Gagal sinkronisasi dari ERP: '.$e->getMessage());
        }

        SyncLog::record('erp', 'ERP sales_facts', 'success', $count, null, (int) round((microtime(true) - $start) * 1000), 'manual', $request->user()->id);

        return back()->with('success', "Sinkronisasi sales selesai. {$count} baris dimuat dari ERP.");
    }

    /** Pull the ERP stock snapshot as of a chosen date (truncate + insert). */
    public function syncStock(Request $request, ErpStockSyncService $stockSync): RedirectResponse
    {
        $data = $request->validate(['as_of' => ['nullable', 'date']]);

        $start = microtime(true);
        try {
            $r = $stockSync->sync($data['as_of'] ?? null);
        } catch (Throwable $e) {
            report($e);
            SyncLog::record('erp', 'ERP stock snapshot', 'failed', null, $e->getMessage(), (int) round((microtime(true) - $start) * 1000), 'manual', $request->user()->id);

            return back()->with('error', 'Gagal tarik stok ERP: '.$e->getMessage());
        }

        SyncLog::record('erp', 'ERP stock snapshot', 'success', $r, null, (int) round((microtime(true) - $start) * 1000), 'manual', $request->user()->id);

        return back()->with('success', "Stok ERP ditarik — {$r['items']} item (per {$r['as_of']}).");
    }

    /** Sync log page — recent runs of all integrations (ERP / Accurate / Hadirr). */
    public function logs(Request $request): Response
    {
        $channel = $request->string('channel')->toString();
        $status = $request->string('status')->toString();

        $logs = SyncLog::query()
            ->with('user:id,name')
            ->when($channel !== '', fn ($q) => $q->where('channel', $channel))
            ->when($status !== '', fn ($q) => $q->where('status', $status))
            ->orderByDesc('created_at')
            ->paginate(50)
            ->withQueryString()
            ->through(fn (SyncLog $l) => [
                'id' => $l->id,
                'channel' => $l->channel,
                'source' => $l->source,
                'status' => $l->status,
                'rows' => $l->rows,
                'summary' => $l->summary,
                'message' => $l->message,
                'duration_ms' => $l->duration_ms,
                'trigger' => $l->trigger,
                'user' => $l->user?->name,
                'at' => $l->created_at?->format('Y-m-d H:i:s'),
            ]);

        return Inertia::render('integration/sync-logs', [
            'logs' => $logs,
            'filters' => ['channel' => $channel, 'status' => $status],
        ]);
    }
}
