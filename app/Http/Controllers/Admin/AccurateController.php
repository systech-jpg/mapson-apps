<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateAccurateSettingRequest;
use App\Models\AccurateSetting;
use App\Services\Accurate\AccurateService;
use App\Services\Accurate\AccurateSyncService;
use App\Support\InventorySnapshot;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class AccurateController extends Controller
{
    public function __construct(protected AccurateService $accurate)
    {
    }

    public function settings(): Response
    {
        $s = AccurateSetting::current();

        return Inertia::render('accurate/settings', [
            'settings' => [
                'base_url' => $s->base_url,
                'client_id' => $s->client_id,
                'scope' => $s->scope,
                'database_id' => $s->database_id,
                'api_host' => $s->api_host,
                'is_active' => $s->is_active,
                'connected' => $s->isConnected(),
                'token_expires_at' => $s->token_expires_at?->format('d M Y H:i'),
                'has_client_secret' => filled($s->client_secret),
                'has_signature_secret' => filled($s->signature_secret),
                'has_access_token' => filled($s->access_token),
                'has_refresh_token' => filled($s->refresh_token),
                'has_session_id' => filled($s->session_id),
                'redirect_uri' => $this->accurate->callbackUrl(),
            ],
        ]);
    }

    public function update(UpdateAccurateSettingRequest $request): RedirectResponse
    {
        $s = AccurateSetting::current();
        $data = $request->validated();

        $s->base_url = $data['base_url'];
        $s->client_id = $data['client_id'] ?? null;
        $s->scope = $data['scope'] ?? null;
        $s->is_active = $data['is_active'] ?? false;

        // Non-secret fields: only touch when the form actually sends them
        // (so the OAuth/open-db flow doesn't get wiped by the credential form).
        if (array_key_exists('api_host', $data)) {
            $s->api_host = $data['api_host'] ?: null;
        }
        if (array_key_exists('database_id', $data)) {
            $s->database_id = $data['database_id'] ?: null;
        }

        // Secrets: only overwrite when a new value is typed (blank = keep existing).
        foreach (['client_secret', 'signature_secret', 'access_token', 'refresh_token', 'session_id'] as $secret) {
            if (filled($data[$secret] ?? null)) {
                $s->{$secret} = $data[$secret];
            }
        }

        // Manually pasting a token counts as connected/active.
        if (filled($data['access_token'] ?? null)) {
            $s->is_active = true;
        }

        $s->save();

        return back()->with('success', 'Pengaturan Accurate berhasil disimpan.');
    }

    /** Step 1: redirect the user to Accurate to authorize. */
    public function connect(): RedirectResponse
    {
        $s = AccurateSetting::current();

        if (blank($s->client_id) || blank($s->client_secret)) {
            return back()->with('error', 'Lengkapi Client ID & Client Secret lalu Simpan dulu.');
        }

        return redirect()->away($this->accurate->authorizeUrl($s));
    }

    /** Step 2: Accurate redirects back here with ?code=... */
    public function callback(Request $request): RedirectResponse
    {
        if ($error = $request->string('error')->toString()) {
            return to_route('accurate.settings')->with('error', 'Accurate menolak otorisasi: '.$error);
        }

        $code = $request->string('code')->toString();
        if (blank($code)) {
            return to_route('accurate.settings')->with('error', 'Authorization code tidak diterima dari Accurate.');
        }

        $result = $this->accurate->exchangeCode(AccurateSetting::current(), $code);

        return to_route('accurate.settings')->with($result['ok'] ? 'success' : 'error', $result['message']);
    }

    /** List databases (for the picker), loaded on demand. */
    public function databases(): JsonResponse
    {
        return response()->json($this->accurate->listDatabases(AccurateSetting::current()));
    }

    /** Open a database to capture host + session. */
    public function openDb(Request $request): RedirectResponse
    {
        $request->validate(['database_id' => ['required', 'string']]);

        $result = $this->accurate->openDatabase(AccurateSetting::current(), $request->string('database_id')->toString());

        return back()->with($result['ok'] ? 'success' : 'error', $result['message']);
    }

    public function disconnect(): RedirectResponse
    {
        AccurateSetting::current()->update([
            'access_token' => null,
            'refresh_token' => null,
            'token_expires_at' => null,
            'session_id' => null,
            'api_host' => null,
            'is_active' => false,
        ]);

        return back()->with('success', 'Koneksi Accurate diputuskan.');
    }

    public function test(): RedirectResponse
    {
        $result = $this->accurate->testConnection();

        return back()->with($result['ok'] ? 'success' : 'error', $result['message']);
    }

    /** Sales page (pick a period, then fetch). */
    public function salesPage(): Response
    {
        $s = AccurateSetting::current();

        return Inertia::render('accurate/sales', [
            // Session is optional (API tokens include the session); only token + host are required.
            'ready' => $s->isConnected() && filled($s->api_host),
            'status' => [
                'token' => $s->isConnected(),
                'host' => filled($s->api_host),
                'session' => filled($s->session_id),
            ],
        ]);
    }

    /** Fetch sales invoices for a period (JSON, loaded on demand). */
    public function salesData(Request $request): JsonResponse
    {
        $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $from = \Illuminate\Support\Carbon::parse($request->input('from'))->format('d/m/Y');
        $to = \Illuminate\Support\Carbon::parse($request->input('to'))->format('d/m/Y');

        return response()->json(
            $this->accurate->salesInvoices(AccurateSetting::current(), $from, $to, $request->integer('page', 1))
        );
    }

    /** Fetch one invoice's line-item detail (JSON, on demand). */
    public function salesDetail(int $id): JsonResponse
    {
        return response()->json(
            $this->accurate->salesInvoiceDetail(AccurateSetting::current(), $id)
        );
    }

    /** Staging tabs (header + expandable item subgrid). One tab per document type. */
    private const STAGING = [
        'invoices' => [
            'table' => 'acc_sales_invoices', 'label' => 'Faktur', 'search' => ['number', 'customer_name', 'po_number'],
            'cols' => ['number' => 'No. Faktur', 'trans_date' => 'Tanggal', 'customer_name' => 'Customer', 'po_number' => 'PO Number', 'status_name' => 'Status', 'dpp' => 'DPP', 'ppn' => 'PPN', 'total' => 'Total'],
            'item_table' => 'acc_sales_invoice_items', 'item_fk' => 'erp_invoice_id',
            'item_cols' => ['invoice_number' => 'No. Faktur', 'trans_date' => 'Tanggal', 'item_no' => 'Kode', 'item_name' => 'Item', 'qty' => 'Qty', 'unit' => 'Satuan', 'unit_price' => 'Harga', 'total' => 'Total', 'so_number' => 'SO', 'do_number' => 'DO'],
        ],
        'sales_orders' => [
            'table' => 'acc_sales_orders', 'label' => 'Sales Order', 'search' => ['number', 'customer_name', 'po_number'],
            'cols' => ['number' => 'No. SO', 'trans_date' => 'Tanggal', 'po_number' => 'PO Number', 'customer_name' => 'Customer', 'status_name' => 'Status', 'total' => 'Total'],
            'item_table' => 'acc_sales_order_items', 'item_fk' => 'erp_so_id',
            'item_cols' => ['so_number' => 'No. SO', 'trans_date' => 'Tanggal', 'item_no' => 'Kode', 'item_name' => 'Item', 'qty' => 'Qty', 'unit' => 'Satuan', 'unit_price' => 'Harga', 'total' => 'Total'],
        ],
        'delivery_orders' => [
            'table' => 'acc_delivery_orders', 'label' => 'Delivery Order', 'search' => ['number', 'customer_name', 'po_number'],
            'cols' => ['number' => 'No. DO', 'trans_date' => 'Tanggal', 'po_number' => 'PO Number', 'customer_name' => 'Customer'],
            'item_table' => 'acc_delivery_order_items', 'item_fk' => 'erp_do_id',
            'item_cols' => ['do_number' => 'No. DO', 'trans_date' => 'Tanggal', 'item_no' => 'Kode', 'item_name' => 'Item', 'qty' => 'Qty', 'unit' => 'Satuan', 'so_number' => 'SO'],
        ],
    ];

    /** Numeric columns (rendered as Excel numbers, not text). */
    private const NUMERIC_COLS = ['dpp', 'ppn', 'total', 'unit_price', 'gross', 'qty', 'disc_amount'];

    /** Apply tab search + period (trans_date) filters to a staging query. */
    private function stagingQuery(string $tab, Request $request)
    {
        $cfg = self::STAGING[$tab];
        $q = trim((string) $request->input('q', ''));
        $from = $request->date('from')?->toDateString();
        $to = $request->date('to')?->toDateString();

        return DB::table($cfg['table'])
            ->when($q !== '', fn ($w) => $w->where(function ($x) use ($cfg, $q) {
                foreach ($cfg['search'] as $col) {
                    $x->orWhere($col, 'like', "%{$q}%");
                }
            }))
            ->when($from, fn ($w) => $w->whereDate('trans_date', '>=', $from))
            ->when($to, fn ($w) => $w->whereDate('trans_date', '<=', $to));
    }

    /** Browse the local Accurate staging tables (per-tab, paginated, period-filtered). */
    public function staging(Request $request): Response
    {
        $tab = $request->string('tab')->toString();
        if (! isset(self::STAGING[$tab])) {
            $tab = 'invoices';
        }

        $cfg = self::STAGING[$tab];
        $rows = $this->stagingQuery($tab, $request)->orderByDesc('trans_date')->orderByDesc('id')->paginate(25)->withQueryString();

        // Item subgrid: items for the visible headers, grouped by parent erp_id.
        $erpIds = collect($rows->items())->pluck('erp_id')->filter()->values()->all();
        $items = [];
        if ($erpIds) {
            foreach (DB::table($cfg['item_table'])->whereIn($cfg['item_fk'], $erpIds)->orderBy('seq')->orderBy('id')->get() as $it) {
                $items[$it->{$cfg['item_fk']}][] = $it;
            }
        }

        // Badge counts reflect the active period + search filter (per tab's own search cols).
        $counts = [];
        $lastSync = null;
        foreach (self::STAGING as $key => $c) {
            $counts[$key] = $this->stagingQuery($key, $request)->count();
            $m = DB::table($c['table'])->max('synced_at');
            if ($m && (! $lastSync || $m > $lastSync)) {
                $lastSync = $m;
            }
        }

        $s = AccurateSetting::current();

        return Inertia::render('accurate/staging', [
            'tab' => $tab,
            'rows' => $rows,
            'items' => $items,
            'filters' => [
                'q' => trim((string) $request->input('q', '')),
                'from' => $request->date('from')?->toDateString() ?: now()->startOfMonth()->toDateString(),
                'to' => $request->date('to')?->toDateString() ?: now()->toDateString(),
            ],
            'counts' => $counts,
            'lastSync' => $lastSync,
            'ready' => $s->isConnected() && filled($s->api_host),
        ]);
    }

    /** Pull selected datasets (faktur / SO / DO + their items) for a period into staging. */
    public function stagingSync(Request $request, AccurateSyncService $sync): RedirectResponse
    {
        $data = $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
            'targets' => ['nullable', 'array'],
            'targets.*' => ['in:faktur,so,do'],
        ]);

        $targets = ! empty($data['targets']) ? $data['targets'] : ['faktur', 'so', 'do'];
        $from = Carbon::parse($data['from'])->format('d/m/Y');
        $to = Carbon::parse($data['to'])->format('d/m/Y');

        $parts = [];
        $start = microtime(true);
        try {
            if (in_array('faktur', $targets, true)) {
                $r = $sync->syncSales($from, $to);
                $parts[] = "{$r['invoices']} faktur ({$r['items']} item)";
            }
            if (in_array('so', $targets, true)) {
                $r = $sync->syncSalesOrders($from, $to);
                $parts[] = "{$r['sales_orders']} SO ({$r['so_items']} item)";
            }
            if (in_array('do', $targets, true)) {
                $r = $sync->syncDeliveryOrders($from, $to);
                $parts[] = "{$r['delivery_orders']} DO ({$r['do_items']} item)";
            }
        } catch (Throwable $e) {
            \App\Models\SyncLog::record('accurate', 'Accurate staging', 'failed', null, $e->getMessage(), (int) round((microtime(true) - $start) * 1000), 'manual', $request->user()->id);

            return back()->with('error', 'Gagal tarik dari Accurate: '.$e->getMessage());
        }

        \App\Models\SyncLog::record('accurate', 'Accurate staging ('.implode('+', $targets).')', 'success', implode(', ', $parts), null, (int) round((microtime(true) - $start) * 1000), 'manual', $request->user()->id);

        return back()->with('success', 'Tarik selesai — '.implode(', ', $parts).'.');
    }

    /**
     * Reconstruct the per-item stock movement ledger (acc_stock_movements) from documents
     * for a date range — the per-item-correct source for stock cards / reconciliation.
     */
    public function stockMovementsSync(Request $request, AccurateSyncService $sync): RedirectResponse
    {
        $data = $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
            'truncate' => ['nullable', 'boolean'],
        ]);

        $from = Carbon::parse($data['from'])->format('d/m/Y');
        $to = Carbon::parse($data['to'])->format('d/m/Y');

        $start = microtime(true);
        try {
            $result = $sync->syncStockMovements($from, $to, null, (bool) ($data['truncate'] ?? false));
        } catch (Throwable $e) {
            \App\Models\SyncLog::record('accurate', 'Accurate stock movements', 'failed', null, $e->getMessage(), (int) round((microtime(true) - $start) * 1000), 'manual', $request->user()->id);

            return back()->with('error', 'Gagal tarik mutasi stok: '.$e->getMessage());
        }

        $parts = [];
        $totalLines = 0;
        foreach ($result as $type => $r) {
            $parts[] = "{$type}:{$r['lines']}";
            $totalLines += $r['lines'];
        }

        \App\Models\SyncLog::record('accurate', 'Accurate stock movements', 'success', $totalLines, implode(' ', $parts), (int) round((microtime(true) - $start) * 1000), 'manual', $request->user()->id);

        return back()->with('success', "Tarik mutasi stok selesai — {$totalLines} baris (".implode(' ', $parts).').');
    }

    /** Export the current staging tab (filtered) to Excel — Header & Detail on separate sheets. */
    public function stagingExport(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $tab = $request->string('tab')->toString();
        if (! isset(self::STAGING[$tab])) {
            $tab = 'invoices';
        }
        $cfg = self::STAGING[$tab];

        // Filtered headers, then their items (subgrid) for the same set.
        $headers = $this->stagingQuery($tab, $request)->orderByDesc('trans_date')->orderByDesc('id')->limit(10000)->get();
        $erpIds = $headers->pluck('erp_id')->filter()->values()->all();
        $items = $erpIds
            ? DB::table($cfg['item_table'])->whereIn($cfg['item_fk'], $erpIds)->orderBy($cfg['item_fk'])->orderBy('seq')->orderBy('id')->get()
            : collect();

        $xml = '<?xml version="1.0" encoding="UTF-8"?>'."\n".'<?mso-application progid="Excel.Sheet"?>'."\n"
            .'<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
            .$this->xmlSheet('Header', $cfg['cols'], $headers)
            .$this->xmlSheet('Detail', $cfg['item_cols'], $items)
            .'</Workbook>';

        return response($xml, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="staging-'.$tab.'.xls"',
        ]);
    }

    /** Current stock snapshot (item/list.do) browser. */
    public function stock(Request $request): Response
    {
        $q = trim((string) $request->input('q', ''));
        $type = $request->string('type')->toString();
        $inStock = $request->boolean('in_stock');

        // Snapshot Accurate terakhir; kolom di-alias ke nama lama agar halaman tak berubah.
        $rows = InventorySnapshot::latest(InventorySnapshot::ACCURATE)
            ->select('id', 'ref as item_no', 'label as name', 'item_type', 'unit_price', 'qty as quantity', 'available_to_sell')
            ->when($q !== '', fn ($w) => $w->where(fn ($x) => $x->where('ref', 'like', "%{$q}%")->orWhere('label', 'like', "%{$q}%")))
            ->when($type !== '', fn ($w) => $w->where('item_type', $type))
            ->when($inStock, fn ($w) => $w->where('qty', '!=', 0))
            ->orderBy('ref')
            ->paginate(50)
            ->withQueryString();

        $s = AccurateSetting::current();

        return Inertia::render('accurate/stock', [
            'rows' => $rows,
            'filters' => ['q' => $q, 'type' => $type, 'in_stock' => $inStock],
            'types' => InventorySnapshot::latest(InventorySnapshot::ACCURATE)->whereNotNull('item_type')->distinct()->orderBy('item_type')->pluck('item_type'),
            'count' => InventorySnapshot::latest(InventorySnapshot::ACCURATE)->count(),
            'lastSync' => InventorySnapshot::latest(InventorySnapshot::ACCURATE)->max('synced_at'),
            'snapshotDate' => InventorySnapshot::latestDate(InventorySnapshot::ACCURATE),
            'today' => now()->toDateString(),
            'ready' => $s->isConnected() && filled($s->api_host),
        ]);
    }

    /** Pull the current stock snapshot from Accurate (optionally truncate first). */
    public function stockSync(Request $request, AccurateSyncService $sync): RedirectResponse
    {
        $data = $request->validate([
            'snapshot_date' => ['nullable', 'date'],
            'truncate' => ['nullable', 'boolean'],
        ]);

        $start = microtime(true);
        try {
            $r = $sync->syncItemStock($data['snapshot_date'] ?? null, (bool) ($data['truncate'] ?? false));
        } catch (Throwable $e) {
            \App\Models\SyncLog::record('accurate', 'Accurate stock snapshot', 'failed', null, $e->getMessage(), (int) round((microtime(true) - $start) * 1000), 'manual', $request->user()->id);

            return back()->with('error', 'Gagal tarik stok: '.$e->getMessage());
        }

        \App\Models\SyncLog::record('accurate', 'Accurate stock snapshot', 'success', $r, null, (int) round((microtime(true) - $start) * 1000), 'manual', $request->user()->id);

        return back()->with('success', "Tarik stok selesai — {$r['items']} item.");
    }

    /** Export the (filtered) stock snapshot to .xls. */
    public function stockExport(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $q = trim((string) $request->input('q', ''));
        $type = $request->string('type')->toString();
        $inStock = $request->boolean('in_stock');

        // Alias ke nama kolom lama supaya definisi $cols di bawah tetap berlaku.
        $rows = InventorySnapshot::latest(InventorySnapshot::ACCURATE)
            ->select('ref as item_no', 'label as name', 'item_type', 'unit_price', 'qty as quantity', 'available_to_sell', 'snapshot_date')
            ->when($q !== '', fn ($w) => $w->where(fn ($x) => $x->where('ref', 'like', "%{$q}%")->orWhere('label', 'like', "%{$q}%")))
            ->when($type !== '', fn ($w) => $w->where('item_type', $type))
            ->when($inStock, fn ($w) => $w->where('qty', '!=', 0))
            ->orderBy('ref')
            ->limit(20000)
            ->get();

        $cols = ['item_no' => 'Kode', 'name' => 'Nama Item', 'item_type' => 'Tipe', 'unit_price' => 'Harga', 'quantity' => 'Stok', 'available_to_sell' => 'Tersedia', 'snapshot_date' => 'Tanggal Snapshot'];
        $xml = '<?xml version="1.0" encoding="UTF-8"?>'."\n".'<?mso-application progid="Excel.Sheet"?>'."\n"
            .'<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
            .$this->xmlSheet('Stok', $cols, $rows)
            .'</Workbook>';

        return response($xml, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="stok-accurate.xls"',
        ]);
    }

    /**
     * Build one SpreadsheetML <Worksheet> from a column map + rows.
     *
     * @param  array<string, string>  $cols  key => header label
     * @param  \Illuminate\Support\Collection<int, object>  $rows
     */
    private function xmlSheet(string $name, array $cols, $rows): string
    {
        $esc = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES | ENT_XML1);

        $head = '<Row>';
        foreach ($cols as $label) {
            $head .= '<Cell><Data ss:Type="String">'.$esc($label).'</Data></Cell>';
        }
        $head .= '</Row>';

        $body = '';
        foreach ($rows as $r) {
            $body .= '<Row>';
            foreach ($cols as $key => $label) {
                $v = $r->{$key} ?? null;
                if ($v === null || $v === '') {
                    $body .= '<Cell><Data ss:Type="String"></Data></Cell>';
                } elseif (in_array($key, self::NUMERIC_COLS, true)) {
                    $body .= '<Cell><Data ss:Type="Number">'.(float) $v.'</Data></Cell>';
                } else {
                    $body .= '<Cell><Data ss:Type="String">'.$esc($v).'</Data></Cell>';
                }
            }
            $body .= '</Row>';
        }

        return '<Worksheet ss:Name="'.$esc($name).'"><Table>'.$head.$body.'</Table></Worksheet>';
    }
}
