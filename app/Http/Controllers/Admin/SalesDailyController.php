<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PricingHospital;
use App\Models\SalesDailyEntry;
use App\Models\SalesDailyItem;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class SalesDailyController extends Controller
{
    /** Daftar input sales harian per bulan + KPI ringkas dan opsi autocomplete form. */
    public function index(Request $request): Response
    {
        $month = preg_match('/^\d{4}-\d{2}$/', (string) $request->input('month'))
            ? $request->input('month') : now()->format('Y-m');
        $type = in_array($request->input('type'), SalesDailyEntry::TYPES, true) ? $request->input('type') : null;
        $q = trim((string) $request->input('q'));

        $base = SalesDailyEntry::query()
            ->whereRaw("DATE_FORMAT(entry_date, '%Y-%m') = ?", [$month]);

        $kpi = (clone $base)->selectRaw("
            COUNT(*) entries, COALESCE(SUM(total_amount), 0) nilai,
            COALESCE(SUM(CASE WHEN sales_type = 'tindakan' THEN total_amount END), 0) nilai_tindakan,
            COALESCE(SUM(CASE WHEN sales_type = 'bhp' THEN total_amount END), 0) nilai_bhp,
            COALESCE(SUM(CASE WHEN sales_type = 'unit' THEN total_amount END), 0) nilai_unit
        ")->first();

        $entries = $base
            ->when($type, fn ($qq) => $qq->where('sales_type', $type))
            ->when($q !== '', fn ($qq) => $qq->where(function ($w) use ($q) {
                $w->where('hospital_name', 'like', "%{$q}%")
                    ->orWhere('doctor_name', 'like', "%{$q}%")
                    ->orWhere('patient_name', 'like', "%{$q}%")
                    ->orWhere('sales_name', 'like', "%{$q}%")
                    ->orWhereHas('items', fn ($i) => $i->where(fn ($g) => $g
                        ->where('item_code', 'like', "%{$q}%")
                        ->orWhere('description', 'like', "%{$q}%")));
            }))
            ->with(['items', 'creator:id,name'])
            ->orderByDesc('entry_date')->orderByDesc('id')
            ->paginate(20)->withQueryString();

        return Inertia::render('sales/daily', [
            'month' => $month,
            'type' => $type,
            'q' => $q,
            'entries' => $entries,
            'kpi' => [
                'entries' => (int) $kpi->entries,
                'nilai' => (float) $kpi->nilai,
                'nilaiTindakan' => (float) $kpi->nilai_tindakan,
                'nilaiBhp' => (float) $kpi->nilai_bhp,
                'nilaiUnit' => (float) $kpi->nilai_unit,
            ],
            'options' => $this->formOptions(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);

        DB::transaction(function () use ($data, $request) {
            $entry = SalesDailyEntry::create($data['header'] + ['created_by' => $request->user()->id]);
            $this->syncItems($entry, $data['items']);
        });

        return back()->with('success', 'Input sales tersimpan.');
    }

    public function update(Request $request, SalesDailyEntry $entry): RedirectResponse
    {
        $data = $this->validated($request);

        DB::transaction(function () use ($entry, $data) {
            $entry->update($data['header']);
            $entry->items()->delete();
            $this->syncItems($entry, $data['items']);
        });

        return back()->with('success', 'Input sales diperbarui.');
    }

    /**
     * Impor massal dari Excel — file diparse & digrup jadi transaksi di sisi client
     * (lihat daily.tsx), server tinggal memvalidasi ulang & menyimpan dalam satu transaksi.
     */
    public function import(Request $request): RedirectResponse
    {
        $v = $request->validate([
            'entries' => ['required', 'array', 'min:1', 'max:500'],
            'entries.*.entry_date' => ['required', 'date'],
            'entries.*.sales_type' => ['required', 'in:'.implode(',', SalesDailyEntry::TYPES)],
            'entries.*.hospital_name' => ['required', 'string', 'max:160'],
            'entries.*.doctor_name' => ['nullable', 'string', 'max:160'],
            'entries.*.patient_name' => ['nullable', 'string', 'max:160'],
            'entries.*.sales_name' => ['nullable', 'string', 'max:120'],
            'entries.*.notes' => ['nullable', 'string', 'max:255'],
            'entries.*.items' => ['required', 'array', 'min:1'],
            'entries.*.items.*.principal' => ['nullable', 'string', 'max:80'],
            'entries.*.items.*.item_code' => ['nullable', 'string', 'max:60'],
            'entries.*.items.*.product_line' => ['nullable', 'string', 'max:80'],
            'entries.*.items.*.description' => ['nullable', 'string', 'max:255'],
            'entries.*.items.*.price' => ['required', 'numeric', 'min:0'],
            'entries.*.items.*.qty' => ['required', 'numeric', 'min:0'],
            'entries.*.items.*.disc_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ], [], ['entries' => 'transaksi']);

        $rows = 0;
        DB::transaction(function () use ($v, $request, &$rows) {
            foreach ($v['entries'] as $e) {
                $items = [];
                foreach (array_values($e['items']) as $i => $r) {
                    if (trim((string) ($r['item_code'] ?? '')) === '' && trim((string) ($r['description'] ?? '')) === '') {
                        continue; // baris tanpa identitas item (mis. sisa baris kosong sheet) dilewati
                    }
                    $r['disc_pct'] = (float) ($r['disc_pct'] ?? 0);
                    $r['total'] = round((float) $r['price'] * (float) $r['qty'] * (1 - $r['disc_pct'] / 100), 2);
                    $r['sort_order'] = $i;
                    $items[] = $r;
                }
                if ($items === []) {
                    continue;
                }

                $header = collect($e)->except('items')->all();
                if ($header['sales_type'] !== 'tindakan') {
                    $header['patient_name'] = null;
                }
                $header['total_amount'] = round(array_sum(array_column($items, 'total')), 2);

                $entry = SalesDailyEntry::create($header + ['created_by' => $request->user()->id]);
                $this->syncItems($entry, $items);
                $rows += count($items);
            }
        });

        return back()->with('success', count($v['entries'])." transaksi ({$rows} baris item) berhasil diimpor.");
    }

    public function destroy(SalesDailyEntry $entry): RedirectResponse
    {
        $entry->delete();

        return back()->with('success', 'Input sales dihapus.');
    }

    /**
     * @return array{header: array<string, mixed>, items: list<array<string, mixed>>}
     */
    protected function validated(Request $request): array
    {
        $v = $request->validate([
            'entry_date' => ['required', 'date'],
            'sales_type' => ['required', 'in:'.implode(',', SalesDailyEntry::TYPES)],
            'hospital_name' => ['required', 'string', 'max:160'],
            'doctor_name' => ['nullable', 'string', 'max:160'],
            'patient_name' => ['nullable', 'string', 'max:160'],
            'sales_name' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:255'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.principal' => ['nullable', 'string', 'max:80'],
            'items.*.item_code' => ['nullable', 'string', 'max:60', 'required_without:items.*.description'],
            'items.*.product_line' => ['nullable', 'string', 'max:80'],
            'items.*.description' => ['nullable', 'string', 'max:255'],
            'items.*.price' => ['required', 'numeric', 'min:0'],
            'items.*.qty' => ['required', 'numeric', 'min:0'],
            'items.*.disc_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ], [], [
            'entry_date' => 'tanggal', 'hospital_name' => 'rumah sakit', 'items' => 'baris item',
        ]);

        $items = [];
        foreach (array_values($v['items']) as $i => $r) {
            $r['disc_pct'] = (float) ($r['disc_pct'] ?? 0);
            $r['total'] = round((float) $r['price'] * (float) $r['qty'] * (1 - $r['disc_pct'] / 100), 2);
            $r['sort_order'] = $i;
            $items[] = $r;
        }

        $header = collect($v)->except('items')->all();
        // BHP & Unit tidak mengenal pasien — jangan simpan sisa isian yang tersembunyi di form.
        if ($header['sales_type'] !== 'tindakan') {
            $header['patient_name'] = null;
        }
        $header['total_amount'] = round(array_sum(array_column($items, 'total')), 2);

        return ['header' => $header, 'items' => $items];
    }

    /** @param  list<array<string, mixed>>  $items */
    protected function syncItems(SalesDailyEntry $entry, array $items): void
    {
        foreach ($items as $item) {
            $entry->items()->create($item);
        }
    }

    /**
     * Opsi autocomplete form dari data yang pernah diinput (+ master RS pricing).
     * Katalog item = baris TERAKHIR per kode → auto-isi jenis/deskripsi/harga di form.
     *
     * @return array<string, mixed>
     */
    protected function formOptions(): array
    {
        $hospitals = SalesDailyEntry::query()->distinct()->pluck('hospital_name')
            ->merge(PricingHospital::where('is_active', true)->pluck('name'))
            ->map(fn ($n) => trim((string) $n))->filter()->unique()->sort()->values();

        // Harga jual resmi per kode dari master produk ERP (kolom price = HT, sebelum PPN —
        // konsisten dengan form yang menambahkan PPN 11% sendiri). Prioritas di atas harga histori.
        $erpPrice = [];
        try {
            $rows = DB::connection(config('erp.connection'))->table(config('erp.prefix').'product')
                ->whereNotNull('ref')->where('ref', '!=', '')->where('price', '>', 0)
                ->pluck('price', 'ref');
            foreach ($rows as $ref => $pr) {
                $erpPrice[mb_strtolower((string) $ref)] = (float) $pr;
            }
        } catch (\Throwable) {
            // ERP offline → pakai harga histori saja.
        }
        $priceFor = fn (string $code, float $fallback) => $erpPrice[mb_strtolower($code)] ?? $fallback;

        // Katalog kode = histori input (punya jenis & harga terakhir) DIPERKAYA master item
        // dari snapshot stok ERP (ref → label + principal) — sumber lookup principal per kode,
        // karena principal tidak lagi diketik manual di form.
        $latestPerCode = SalesDailyItem::query()
            ->whereNotNull('item_code')->where('item_code', '!=', '')
            ->selectRaw('MAX(id) id')->groupBy('item_code');
        $catalog = SalesDailyItem::whereIn('id', $latestPerCode)
            ->orderBy('item_code')->limit(1000)
            ->get(['item_code', 'principal', 'product_line', 'description', 'price'])
            ->map(fn ($r) => [
                'code' => $r->item_code, 'principal' => $r->principal,
                'line' => $r->product_line, 'description' => $r->description,
                'price' => $priceFor($r->item_code, (float) $r->price),
            ]);

        try {
            $known = $catalog->pluck('code')->map(fn ($c) => mb_strtolower($c))->flip();
            $snapshot = \App\Support\InventorySnapshot::erp()
                ->whereNotNull('ref')->where('ref', '!=', '')
                ->get(['ref', 'label', 'principal'])
                ->filter(fn ($r) => ! isset($known[mb_strtolower($r->ref)]))
                ->map(fn ($r) => [
                    'code' => $r->ref, 'principal' => $r->principal ?: null,
                    'line' => null, 'description' => $r->label ?: null,
                    'price' => $priceFor((string) $r->ref, 0.0),
                ])->values();
            $catalog = $catalog->concat($snapshot)->sortBy('code')->values();
        } catch (\Throwable) {
            // Snapshot belum ada → katalog dari histori saja.
        }

        // Master dokter & principal dari ERP + histori input; ERP offline → histori tetap jalan.
        $erpDoctors = collect();
        $erpPrincipals = collect();
        try {
            $erp = DB::connection(config('erp.connection'));
            $p = config('erp.prefix');
            $erpDoctors = $erp->table($p.'c_doctor')
                ->where('status', 1)->orderBy('fullname')->pluck('fullname');
            // Principal = societe dengan third-party type TE_PRINCIPLE; nama tampil pakai alias.
            $erpPrincipals = $erp->table($p.'societe as s')
                ->join($p.'c_typent as t', 't.id', '=', 's.fk_typent')
                ->where('t.code', 'TE_PRINCIPLE')->where('s.status', 1)
                ->get(['s.nom', 's.name_alias'])
                ->map(fn ($r) => trim((string) ($r->name_alias ?: $r->nom)));
        } catch (\Throwable) {
        }

        return [
            'hospitals' => $hospitals,
            'doctors' => SalesDailyEntry::query()->whereNotNull('doctor_name')->distinct()->pluck('doctor_name')
                ->merge($erpDoctors)
                ->map(fn ($n) => trim((string) $n))->filter(fn ($n) => $n !== '' && $n !== '-')
                ->unique(fn ($n) => mb_strtolower($n))->sort()->values(),
            'salesNames' => SalesDailyEntry::query()->whereNotNull('sales_name')->distinct()->orderBy('sales_name')->pluck('sales_name'),
            'principals' => SalesDailyItem::query()->whereNotNull('principal')->where('principal', '!=', '')->distinct()->pluck('principal')
                ->merge($erpPrincipals)
                ->map(fn ($n) => trim((string) $n))->filter()
                ->unique(fn ($n) => mb_strtolower($n))->sort()->values(),
            'lines' => SalesDailyItem::query()->whereNotNull('product_line')->where('product_line', '!=', '')->distinct()->orderBy('product_line')->pluck('product_line'),
            'catalog' => $catalog,
        ];
    }
}
