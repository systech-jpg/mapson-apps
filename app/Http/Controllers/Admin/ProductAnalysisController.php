<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SyncLog;
use App\Services\Accurate\AccurateSyncService;
use App\Support\InventorySnapshot;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * TRIAL — "Analisa Produk" dashboard tab: product-level P&L (sales − COGS − biaya
 * lain-lain), stock value & movement for selected principal products. Reads the
 * existing acc_* staging tables; writes only to tmp_-prefixed trial tables.
 */
class ProductAnalysisController extends Controller
{
    /** Products under trial + keyword used to auto-detect their Accurate items. */
    protected const PRODUCTS = [
        'Colarose' => ['principal' => 'Phytocemindo', 'keywords' => ['colarose']],
        'Boneguard' => ['principal' => 'Phytocemindo', 'keywords' => ['boneguard']],
    ];

    protected const EXPENSE_CATEGORIES = ['Entertain', 'Konsultan', 'Perizinan', 'Marketing', 'Lainnya'];

    public function index(Request $request): Response
    {
        $maps = DB::table('tmp_product_map')->orderBy('product_label')->orderBy('item_no')->get();
        $itemNos = $maps->pluck('item_no')->all();
        $labelByItem = $maps->pluck('product_label', 'item_no');

        $years = DB::table('acc_sales_invoice_items')
            ->whereNotNull('trans_date')
            ->selectRaw('DISTINCT YEAR(trans_date) y')->orderByDesc('y')->pluck('y')
            ->map(fn ($y) => (string) $y)->values();
        if ($years->isEmpty()) {
            $years = collect([date('Y')]);
        }
        $year = (string) ($request->input('year') ?: $years->first());

        // Weighted average buy price per item (all synced purchases) — the COGS basis.
        $avgCost = DB::table('tmp_product_purchases')
            ->selectRaw('item_no, SUM(qty * unit_price) v, SUM(qty) q')
            ->groupBy('item_no')->get()
            ->mapWithKeys(fn ($r) => [$r->item_no => ((float) $r->q) > 0 ? (float) $r->v / (float) $r->q : null]);

        // Sales per item (selected year) from existing invoice-line staging.
        $soldPerItem = $itemNos ? DB::table('acc_sales_invoice_items')
            ->whereIn('item_no', $itemNos)->whereYear('trans_date', $year)
            ->selectRaw('item_no, SUM(qty) qty, SUM(dpp) dpp')
            ->groupBy('item_no')->get()->keyBy('item_no') : collect();

        // Monthly sales (DPP) per product for the trend chart.
        $monthlyRaw = $itemNos ? DB::table('acc_sales_invoice_items as i')
            ->join('tmp_product_map as m', 'm.item_no', '=', 'i.item_no')
            ->whereYear('i.trans_date', $year)
            ->selectRaw('m.product_label label, MONTH(i.trans_date) m, SUM(i.dpp) dpp, SUM(i.qty) qty')
            ->groupBy('label', 'm')->get() : collect();

        // Stok per item dari snapshot Accurate terakhir (alias ke nama kolom lama).
        $stock = $itemNos ? InventorySnapshot::latest(InventorySnapshot::ACCURATE)
            ->whereIn('ref', $itemNos)
            ->get(['ref as item_no', 'label as name', 'qty as quantity', 'unit_price'])
            ->keyBy('item_no') : collect();

        // Monthly stock movement qty per item (existing ledger) → valued with avg cost.
        $movRaw = $itemNos ? DB::table('acc_stock_movements')
            ->whereIn('item_no', $itemNos)->whereYear('trans_date', $year)
            ->selectRaw('item_no, MONTH(trans_date) m, SUM(GREATEST(qty, 0)) q_in, SUM(LEAST(qty, 0)) q_out')
            ->groupBy('item_no', 'm')->get() : collect();

        // Manual biaya lain-lain for the selected year.
        $expenses = DB::table('tmp_product_expenses')
            ->whereYear('expense_date', $year)
            ->orderByDesc('expense_date')->orderByDesc('id')->get();

        // --- Per-item rows (stock value + sold qty) ---
        $items = $maps->map(function ($m) use ($avgCost, $soldPerItem, $stock) {
            $cost = $avgCost[$m->item_no] ?? null;
            $qty = (float) ($stock[$m->item_no]->quantity ?? 0);

            return [
                'id' => $m->id,
                'item_no' => $m->item_no,
                'item_name' => $m->item_name ?: ($stock[$m->item_no]->name ?? null),
                'product_label' => $m->product_label,
                'principal' => $m->principal,
                'source' => $m->source,
                'stock_qty' => $qty,
                'avg_cost' => $cost,
                'stock_value' => $cost !== null ? $qty * $cost : null,
                'sold_qty' => (float) ($soldPerItem[$m->item_no]->qty ?? 0),
                'sold_dpp' => (float) ($soldPerItem[$m->item_no]->dpp ?? 0),
            ];
        })->values();

        // --- Per-product P&L summary ---
        $products = collect(array_keys(self::PRODUCTS))
            ->concat($maps->pluck('product_label'))->unique()->values()
            ->map(function (string $label) use ($items, $expenses) {
                $rows = $items->where('product_label', $label);
                $salesDpp = (float) $rows->sum('sold_dpp');
                $cogsKnown = $rows->every(fn ($r) => $r['avg_cost'] !== null || $r['sold_qty'] == 0.0);
                $cogs = (float) $rows->sum(fn ($r) => $r['avg_cost'] !== null ? $r['sold_qty'] * $r['avg_cost'] : 0);
                $gross = $salesDpp - $cogs;
                $exp = (float) $expenses->where('product_label', $label)->sum('amount');

                return [
                    'label' => $label,
                    'principal' => self::PRODUCTS[$label]['principal'] ?? ($rows->first()['principal'] ?? null),
                    'items' => $rows->count(),
                    'salesQty' => (float) $rows->sum('sold_qty'),
                    'salesDpp' => $salesDpp,
                    'cogs' => $cogs,
                    'cogsComplete' => $cogsKnown,
                    'gross' => $gross,
                    'expenses' => $exp,
                    'contribution' => $gross - $exp,
                    'stockQty' => (float) $rows->sum('stock_qty'),
                    'stockValue' => $rows->contains(fn ($r) => $r['stock_value'] === null && $r['stock_qty'] > 0)
                        ? null
                        : (float) $rows->sum(fn ($r) => $r['stock_value'] ?? 0),
                ];
            })->values();

        // --- Monthly trend: sales DPP per product + movement value in/out ---
        $names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        $labels = $products->pluck('label')->all();
        $trend = [];
        for ($m = 1; $m <= 12; $m++) {
            $sales = [];
            foreach ($labels as $label) {
                $sales[$label] = (float) ($monthlyRaw->first(fn ($r) => $r->label === $label && (int) $r->m === $m)->dpp ?? 0);
            }
            $in = 0.0;
            $out = 0.0;
            foreach ($movRaw->where('m', $m) as $r) {
                $cost = $avgCost[$r->item_no] ?? null;
                if ($cost !== null) {
                    $in += (float) $r->q_in * $cost;
                    $out += abs((float) $r->q_out) * $cost;
                }
            }
            $trend[] = ['month' => $names[$m - 1], 'sales' => $sales, 'stockIn' => $in, 'stockOut' => $out];
        }

        // --- Biaya lain-lain breakdown ---
        $expenseByCategory = $expenses->groupBy('category')
            ->map(fn ($g, $cat) => ['label' => $cat, 'value' => (float) $g->sum('amount')])
            ->sortByDesc('value')->values();

        $lastPurchaseSync = DB::table('tmp_product_purchases')->max('synced_at');

        return Inertia::render('dashboard/product-analysis', [
            'years' => $years,
            'year' => $year,
            'productOptions' => array_keys(self::PRODUCTS),
            'expenseCategories' => self::EXPENSE_CATEGORIES,
            'hasMapping' => $maps->isNotEmpty(),
            'products' => $products,
            'items' => $items,
            'trend' => $trend,
            'expenses' => $expenses->map(fn ($e) => [
                'id' => $e->id,
                'expense_date' => $e->expense_date,
                'product_label' => $e->product_label,
                'category' => $e->category,
                'description' => $e->description,
                'amount' => (float) $e->amount,
            ])->values(),
            'generalExpenses' => (float) $expenses->whereNull('product_label')->sum('amount'),
            'expenseByCategory' => $expenseByCategory,
            'purchases' => DB::table('tmp_product_purchases')
                ->orderByDesc('trans_date')->orderByDesc('id')->limit(15)
                ->get(['id', 'doc_number', 'trans_date', 'vendor_name', 'item_no', 'item_name', 'qty', 'unit_price', 'total']),
            'lastPurchaseSync' => $lastPurchaseSync,
        ]);
    }

    /**
     * Auto-detect mapped items by keyword, then pull their purchase-invoice lines
     * from Accurate into tmp_product_purchases (COGS basis).
     */
    public function sync(Request $request, AccurateSyncService $sync): RedirectResponse
    {
        $data = $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
        ]);

        $t0 = microtime(true);

        try {
            $detected = $this->detectItems();

            $itemNos = DB::table('tmp_product_map')->pluck('item_no')->all();
            if (! $itemNos) {
                return back()->with('error', 'Tidak ada item Manual Import yang cocok dengan kata kunci produk (Colarose/Boneguard). Tarik data stok/penjualan Manual Import dulu, atau tambahkan mapping manual.');
            }

            $result = $sync->syncProductPurchases(
                Carbon::parse($data['from'])->format('d/m/Y'),
                Carbon::parse($data['to'])->format('d/m/Y'),
                $itemNos,
            );
            $result['detected_items'] = $detected;

            SyncLog::record('accurate', 'product-analysis', 'success', $result, null, (int) ((microtime(true) - $t0) * 1000), 'manual', $request->user()?->id);

            return back()->with('success', "Selesai: {$detected} item terdeteksi, {$result['purchase_lines']} baris pembelian ditarik.");
        } catch (\Throwable $e) {
            SyncLog::record('accurate', 'product-analysis', 'failed', null, $e->getMessage(), (int) ((microtime(true) - $t0) * 1000), 'manual', $request->user()?->id);

            return back()->with('error', 'Sinkronisasi gagal: '.$e->getMessage());
        }
    }

    /** Scan existing acc_* staging tables for items matching product keywords. */
    protected function detectItems(): int
    {
        $found = 0;

        foreach (self::PRODUCTS as $label => $def) {
            foreach ($def['keywords'] as $kw) {
                $like = '%'.$kw.'%';

                $candidates = InventorySnapshot::latest(InventorySnapshot::ACCURATE)
                    ->where('label', 'like', $like)->whereNotNull('ref')
                    ->get(['ref as item_no', 'label as name'])
                    ->concat(DB::table('acc_sales_invoice_items')
                        ->where('item_name', 'like', $like)->whereNotNull('item_no')
                        ->distinct()->get(['item_no', DB::raw('item_name as name')]))
                    ->unique('item_no');

                foreach ($candidates as $c) {
                    $exists = DB::table('tmp_product_map')->where('item_no', $c->item_no)->exists();
                    if ($exists) {
                        continue; // never overwrite an existing (possibly manual) mapping
                    }
                    DB::table('tmp_product_map')->insert([
                        'item_no' => $c->item_no,
                        'item_name' => $c->name,
                        'product_label' => $label,
                        'principal' => $def['principal'],
                        'source' => 'auto',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $found++;
                }
            }
        }

        return $found;
    }

    public function storeMapping(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'item_no' => ['required', 'string', 'max:255', 'unique:tmp_product_map,item_no'],
            'product_label' => ['required', 'string', 'max:255'],
        ]);

        $name = InventorySnapshot::latest(InventorySnapshot::ACCURATE)->where('ref', $data['item_no'])->value('label')
            ?? DB::table('acc_sales_invoice_items')->where('item_no', $data['item_no'])->value('item_name');

        DB::table('tmp_product_map')->insert([
            'item_no' => $data['item_no'],
            'item_name' => $name,
            'product_label' => $data['product_label'],
            'principal' => self::PRODUCTS[$data['product_label']]['principal'] ?? 'Phytocemindo',
            'source' => 'manual',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return back()->with('success', 'Mapping item ditambahkan.');
    }

    public function destroyMapping(int $id): RedirectResponse
    {
        DB::table('tmp_product_map')->where('id', $id)->delete();

        return back()->with('success', 'Mapping item dihapus.');
    }

    public function storeExpense(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'expense_date' => ['required', 'date'],
            'product_label' => ['nullable', 'string', 'max:255'],
            'category' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:1000'],
            'amount' => ['required', 'numeric', 'min:0'],
        ]);

        DB::table('tmp_product_expenses')->insert([
            'expense_date' => $data['expense_date'],
            'product_label' => $data['product_label'] ?: null,
            'category' => $data['category'],
            'description' => $data['description'] ?? null,
            'amount' => $data['amount'],
            'created_by' => $request->user()?->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return back()->with('success', 'Biaya dicatat.');
    }

    public function destroyExpense(int $id): RedirectResponse
    {
        DB::table('tmp_product_expenses')->where('id', $id)->delete();

        return back()->with('success', 'Biaya dihapus.');
    }
}
