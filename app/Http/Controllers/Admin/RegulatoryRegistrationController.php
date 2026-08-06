<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\RegulatoryRegistration;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

/**
 * Regulatory — Registrasi Produk (daftar izin edar AKL/AKD).
 *
 * Header (nomor izin, masa berlaku, kelas resiko, ...) disimpan lokal karena ERP tidak
 * punya strukturnya. Daftar PRODUK per izin TIDAK disimpan lokal — dibaca langsung dari
 * produk ERP via extrafield `noakl` (llxjp_product_extrafields), dan bisa di-tag/lepas
 * dari halaman ini (tulis balik ke ERP). Aplikasi ini adalah UI maintain-nya; Dolibarr
 * tetap source of truth pemetaan produk↔AKL.
 *
 * Pencocokan noakl longgar: sebagian produk diisi "AKL 11303124710", sebagian "11303124710"
 * — dibandingkan pakai kunci digit-only.
 */
class RegulatoryRegistrationController extends Controller
{
    /** Batas "segera habis" dalam hari. */
    protected const EXPIRING_DAYS = 180;

    /**
     * Pemegang izin edar — HARDCODE sesuai permintaan user (2026-08-05); rencana:
     * nanti diganti lookup third party ERP ber-flag license holder.
     */
    public const LICENSE_HOLDERS = [
        'PT. Mapson Arya Parahita',
        'PT. Asia Actual',
        'PT. Dwipa',
        'PT. Medtronic Indonesia',
    ];

    protected function erpProducts(): Builder
    {
        $p = config('erp.prefix');

        return DB::connection(config('erp.connection'))->table($p.'product as p')
            ->leftJoin($p.'product_extrafields as ef', 'ef.fk_object', '=', 'p.rowid');
    }

    protected function erpExtrafields(): Builder
    {
        return DB::connection(config('erp.connection'))->table(config('erp.prefix').'product_extrafields');
    }

    protected static function digits(?string $s): string
    {
        return preg_replace('/\D+/', '', (string) $s) ?? '';
    }

    /** Peta kunci-digit noakl → jumlah produk ERP yang ter-tag. */
    protected function erpCountsByAkl(): array
    {
        $counts = [];
        foreach ($this->erpExtrafields()->whereNotNull('noakl')->where('noakl', '!=', '')
            ->selectRaw('noakl, COUNT(*) n')->groupBy('noakl')->get() as $r) {
            $key = self::digits($r->noakl);
            if ($key !== '') {
                $counts[$key] = ($counts[$key] ?? 0) + (int) $r->n;
            }
        }

        return $counts;
    }

    public function index(Request $request): Response
    {
        $q = trim((string) $request->input('q'));
        $status = (string) $request->input('status');
        $today = now()->toDateString();
        $soon = now()->addDays(self::EXPIRING_DAYS)->toDateString();

        $erpError = null;
        $counts = [];
        try {
            $counts = $this->erpCountsByAkl();
        } catch (Throwable $e) {
            report($e);
            $erpError = 'ERP tidak terjangkau — jumlah & daftar produk per izin tidak bisa dimuat.';
        }

        // Cari berdasarkan kode produk = lookup dulu noakl produk yang cocok di ERP.
        $aklKeysFromCode = [];
        if ($q !== '' && $erpError === null) {
            try {
                $aklKeysFromCode = $this->erpProducts()
                    ->where('p.ref', 'like', "%{$q}%")
                    ->whereNotNull('ef.noakl')->where('ef.noakl', '!=', '')
                    ->limit(200)->pluck('ef.noakl')
                    ->map(fn ($n) => self::digits($n))->filter()->unique()->values()->all();
            } catch (Throwable) {
            }
        }

        $registrations = RegulatoryRegistration::query()
            ->when($q !== '', fn ($qq) => $qq->where(function ($w) use ($q, $aklKeysFromCode) {
                $w->where('akl_number', 'like', "%{$q}%")
                    ->orWhere('product_name', 'like', "%{$q}%")
                    ->orWhere('manufacturer', 'like', "%{$q}%");
                foreach ($aklKeysFromCode as $key) {
                    $w->orWhereRaw("REPLACE(REPLACE(akl_number, ' ', ''), 'AKL', '') LIKE ?", ["%{$key}%"]);
                }
            }))
            ->when($status === 'active', fn ($qq) => $qq->where(fn ($w) => $w->whereNull('expired_date')->orWhere('expired_date', '>=', $soon)))
            ->when($status === 'expiring', fn ($qq) => $qq->whereBetween('expired_date', [$today, $soon]))
            ->when($status === 'expired', fn ($qq) => $qq->where('expired_date', '<', $today))
            ->orderByRaw('expired_date IS NULL, expired_date')
            ->orderBy('akl_number')
            ->paginate(20)->withQueryString();

        $registrations->getCollection()->transform(function ($r) use ($counts) {
            $r->products_count = $counts[self::digits($r->akl_number)] ?? 0;

            return $r;
        });

        $kpi = RegulatoryRegistration::query()->selectRaw('
            COUNT(*) total,
            SUM(expired_date IS NOT NULL AND expired_date < ?) expired,
            SUM(expired_date BETWEEN ? AND ?) expiring
        ', [$today, $today, $soon])->first();

        // Produk tercakup = produk ERP yang noakl-nya cocok dengan salah satu izin terdaftar.
        $registeredKeys = RegulatoryRegistration::query()->pluck('akl_number')
            ->map(fn ($n) => self::digits($n))->filter()->unique()->flip();
        $coveredProducts = 0;
        foreach ($counts as $key => $n) {
            if (isset($registeredKeys[$key])) {
                $coveredProducts += $n;
            }
        }

        return Inertia::render('regulatory/products', [
            'q' => $q,
            'status' => $status,
            'registrations' => $registrations,
            'kpi' => [
                'total' => (int) $kpi->total,
                'items' => $coveredProducts,
                'expiring' => (int) $kpi->expiring,
                'expired' => (int) $kpi->expired,
            ],
            'expiringDays' => self::EXPIRING_DAYS,
            'erpError' => $erpError,
            'licenseHolders' => self::LICENSE_HOLDERS,
        ]);
    }

    /** Kunci pembanding deskripsi: huruf kecil, spasi dirapikan. */
    protected static function normDesc(?string $s): string
    {
        return mb_strtolower(trim(preg_replace('/\s+/', ' ', (string) $s)));
    }

    /**
     * Halaman detail satu izin — header + tabel produk ERP ter-tag dengan kolom lengkap
     * (kode, deskripsi, principal, reff/barcode, jenis stock, expire date) + tag/lepas.
     */
    public function show(RegulatoryRegistration $registration): Response
    {
        $key = self::digits($registration->akl_number);
        $products = [];
        $erpError = null;

        try {
            $pfx = config('erp.prefix');
            $products = $this->erpProducts()
                // Extrafield principal = sellist berisi rowid societe → resolve ke nama.
                ->leftJoin($pfx.'societe as s', 's.rowid', '=', 'ef.principal')
                ->when($key !== '', fn ($qq) => $qq->where('ef.noakl', 'like', "%{$key}%"))
                ->when($key === '', fn ($qq) => $qq->whereRaw('1 = 0'))
                ->orderBy('p.ref')
                ->limit(2000)
                ->selectRaw("p.rowid, p.ref, p.label, p.barcode, p.tosell, ef.noakl, ef.principalreffnumberbarcode reff, ef.jenisstock, ef.expiredate, COALESCE(NULLIF(s.name_alias, ''), s.nom) principal_name")
                ->get()
                ->filter(fn ($r) => self::digits($r->noakl) === $key)
                ->map(fn ($r) => [
                    'id' => (int) $r->rowid,
                    'ref' => $r->ref,
                    'label' => $r->label,
                    'principal' => $r->principal_name,
                    'barcode' => $r->barcode ?: null,
                    'reff' => $r->reff ?: null,
                    'jenis_stock' => $r->jenisstock ?: null,
                    'expire_date' => $r->expiredate ?: null,
                    'tosell' => (bool) $r->tosell,
                    'noakl' => $r->noakl,
                ])->values()->all();
        } catch (Throwable $e) {
            report($e);
            $erpError = 'ERP tidak terjangkau — daftar produk tidak bisa dimuat.';
        }

        // Bandingkan deskripsi ERP vs lampiran AKL (items lokal hasil impor): tiap produk
        // diberi akl_description + status sama/beda/tidak-di-lampiran.
        $aklItems = $registration->items()->get(['item_code', 'description']);
        $aklByCode = [];
        foreach ($aklItems as $it) {
            $ck = mb_strtolower(trim((string) $it->item_code));
            if ($ck !== '') {
                $aklByCode[$ck] = (string) $it->description;
            }
        }

        $matchedCodes = [];
        $products = array_map(function ($p) use ($aklByCode, &$matchedCodes) {
            $ck = mb_strtolower(trim((string) $p['ref']));
            if (isset($aklByCode[$ck])) {
                $matchedCodes[$ck] = true;
                $p['akl_description'] = $aklByCode[$ck];
                $p['desc_match'] = self::normDesc($p['label']) === self::normDesc($aklByCode[$ck]) ? 'same' : 'diff';
            } else {
                $p['akl_description'] = null;
                $p['desc_match'] = 'missing'; // ter-tag di ERP tapi tidak ada di lampiran AKL (impor)
            }

            return $p;
        }, $products);

        // Kode di lampiran AKL yang tidak ketemu di daftar produk ERP ter-tag — dicek lagi
        // ke master produk: 'untagged' (ada di ERP, tinggal di-Tag) vs 'not_in_erp'
        // (produknya memang belum dibuat di ERP).
        $aklOnly = [];
        foreach ($aklItems as $it) {
            $ck = mb_strtolower(trim((string) $it->item_code));
            if ($ck !== '' && ! isset($matchedCodes[$ck])) {
                $aklOnly[] = ['item_code' => $it->item_code, 'description' => $it->description, 'erp' => null];
            }
        }
        if ($aklOnly !== [] && $erpError === null) {
            try {
                $found = $this->erpProducts()
                    ->whereIn(DB::raw('LOWER(p.ref)'), array_map(fn ($i) => mb_strtolower(trim((string) $i['item_code'])), $aklOnly))
                    ->get(['p.rowid', 'p.ref', 'ef.noakl']);
                $byRef = [];
                foreach ($found as $f) {
                    $byRef[mb_strtolower((string) $f->ref)] = ['id' => (int) $f->rowid, 'noakl' => $f->noakl ?: null];
                }
                foreach ($aklOnly as &$it) {
                    $it['erp'] = $byRef[mb_strtolower(trim((string) $it['item_code']))] ?? null;
                }
                unset($it);
            } catch (Throwable) {
                // Status ERP per kode gagal dicek → tampil tanpa status.
            }
        }

        return Inertia::render('regulatory/product-detail', [
            'registration' => $registration,
            'products' => $products,
            'aklOnly' => $aklOnly,
            'erpError' => $erpError,
            'expiringDays' => self::EXPIRING_DAYS,
            'licenseHolders' => self::LICENSE_HOLDERS,
        ]);
    }

    /**
     * Samakan deskripsi produk ERP dengan deskripsi lampiran AKL (tulis p.label di ERP).
     * product_id spesifik, atau all=true untuk semua yang berbeda pada izin ini.
     */
    public function replaceLabel(Request $request, RegulatoryRegistration $registration): RedirectResponse
    {
        $data = $request->validate([
            'product_id' => ['nullable', 'integer', 'min:1', 'required_without:all'],
            'all' => ['nullable', 'boolean'],
        ]);

        $key = self::digits($registration->akl_number);
        $aklByCode = [];
        foreach ($registration->items()->get(['item_code', 'description']) as $it) {
            $ck = mb_strtolower(trim((string) $it->item_code));
            if ($ck !== '' && trim((string) $it->description) !== '') {
                $aklByCode[$ck] = trim((string) $it->description);
            }
        }
        if ($aklByCode === []) {
            return back()->with('error', 'Belum ada deskripsi lampiran AKL untuk izin ini — impor dulu dari Excel.');
        }

        try {
            $p = config('erp.prefix');
            $targets = $this->erpProducts()
                ->where('ef.noakl', 'like', "%{$key}%")
                ->when(! ($data['all'] ?? false), fn ($qq) => $qq->where('p.rowid', (int) ($data['product_id'] ?? 0)))
                ->get(['p.rowid', 'p.ref', 'p.label', 'ef.noakl'])
                ->filter(fn ($r) => self::digits($r->noakl) === $key);

            $replaced = 0;
            foreach ($targets as $t) {
                $akl = $aklByCode[mb_strtolower(trim((string) $t->ref))] ?? null;
                if ($akl === null || self::normDesc($t->label) === self::normDesc($akl)) {
                    continue;
                }
                DB::connection(config('erp.connection'))->table($p.'product')
                    ->where('rowid', $t->rowid)->update(['label' => $akl]);
                $replaced++;
            }
        } catch (Throwable $e) {
            report($e);

            return back()->with('error', 'Gagal menulis deskripsi ke produk ERP: '.$e->getMessage());
        }

        return back()->with('success', $replaced > 0
            ? "{$replaced} deskripsi produk ERP disamakan dengan lampiran AKL."
            : 'Tidak ada deskripsi yang perlu diganti.');
    }

    /** Cari produk ERP untuk ditautkan ke izin (menampilkan noakl existing sebagai peringatan). */
    public function productSearch(Request $request): JsonResponse
    {
        $q = trim((string) $request->input('q'));
        if (mb_strlen($q) < 2) {
            return response()->json(['rows' => []]);
        }

        try {
            $rows = $this->erpProducts()
                ->where(fn ($w) => $w->where('p.ref', 'like', "%{$q}%")->orWhere('p.label', 'like', "%{$q}%"))
                ->orderBy('p.ref')->limit(30)
                ->get(['p.rowid', 'p.ref', 'p.label', 'ef.noakl'])
                ->map(fn ($r) => ['id' => (int) $r->rowid, 'ref' => $r->ref, 'label' => $r->label, 'noakl' => $r->noakl ?: null]);
        } catch (Throwable $e) {
            report($e);

            return response()->json(['error' => 'Tidak bisa mencari produk di ERP.'], 503);
        }

        return response()->json(['rows' => $rows]);
    }

    /** Tag produk ERP ke izin ini — tulis extrafield noakl di ERP. */
    public function attach(Request $request, RegulatoryRegistration $registration): RedirectResponse
    {
        $data = $request->validate(['product_id' => ['required', 'integer', 'min:1']]);

        try {
            $this->setNoAkl((int) $data['product_id'], $registration->akl_number);
        } catch (Throwable $e) {
            report($e);

            return back()->with('error', 'Gagal menulis No. AKL ke produk ERP: '.$e->getMessage());
        }

        return back()->with('success', 'Produk ditautkan — No. AKL tersimpan di ERP.');
    }

    /** Lepas produk dari izin ini — kosongkan noakl HANYA bila memang milik izin ini. */
    public function detach(Request $request, RegulatoryRegistration $registration): RedirectResponse
    {
        $data = $request->validate(['product_id' => ['required', 'integer', 'min:1']]);

        try {
            $row = $this->erpExtrafields()->where('fk_object', (int) $data['product_id'])->first();
            if (! $row || self::digits($row->noakl) !== self::digits($registration->akl_number)) {
                return back()->with('error', 'Produk itu tidak ter-tag ke izin ini.');
            }
            $this->erpExtrafields()->where('fk_object', (int) $data['product_id'])->update(['noakl' => null]);
        } catch (Throwable $e) {
            report($e);

            return back()->with('error', 'Gagal melepas produk di ERP: '.$e->getMessage());
        }

        return back()->with('success', 'Produk dilepas dari izin — noakl di ERP dikosongkan.');
    }

    /** Upsert baris extrafields produk (baris bisa belum ada utk produk lama). */
    protected function setNoAkl(int $productId, string $aklNumber): void
    {
        $exists = $this->erpExtrafields()->where('fk_object', $productId)->exists();
        if ($exists) {
            $this->erpExtrafields()->where('fk_object', $productId)->update(['noakl' => $aklNumber]);
        } else {
            $this->erpExtrafields()->insert(['fk_object' => $productId, 'noakl' => $aklNumber]);
        }
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        RegulatoryRegistration::create($data + ['created_by' => $request->user()->id]);

        return back()->with('success', 'Registrasi izin edar ditambahkan.');
    }

    public function update(Request $request, RegulatoryRegistration $registration): RedirectResponse
    {
        $registration->update($this->validated($request, $registration->id));

        return back()->with('success', 'Registrasi izin edar diperbarui.');
    }

    public function destroy(RegulatoryRegistration $registration): RedirectResponse
    {
        // Hanya header lokal yang dihapus; noakl di produk ERP TIDAK disentuh.
        $registration->delete();

        return back()->with('success', 'Registrasi izin edar dihapus (tag produk di ERP dibiarkan).');
    }

    /**
     * Impor Excel — header di-upsert per No. AKL; kolom Kode (bila ada) DITULIS sebagai
     * noakl ke produk ERP yang ref-nya cocok. Kode yang tak ada di ERP dilaporkan,
     * dan tag produk lain yang tidak disebut file TIDAK dilepas.
     */
    public function import(Request $request): RedirectResponse
    {
        $v = $request->validate([
            'registrations' => ['required', 'array', 'min:1', 'max:300'],
            'registrations.*.akl_number' => ['required', 'string', 'max:40'],
            // Nullable: file "list produk saja" hanya membawa No. AKL + kode; izin BARU
            // tetap wajib punya nama (di-skip + dilaporkan bila tidak).
            'registrations.*.product_name' => ['nullable', 'string', 'max:255'],
            'registrations.*.manufacturer' => ['nullable', 'string', 'max:255'],
            'registrations.*.license_holder' => ['nullable', 'string', 'max:120'],
            'registrations.*.risk_class' => ['nullable', 'string', 'max:60'],
            'registrations.*.category' => ['nullable', 'string', 'max:120'],
            'registrations.*.sub_category' => ['nullable', 'string', 'max:120'],
            'registrations.*.product_type' => ['nullable', 'string', 'max:160'],
            'registrations.*.application_type' => ['nullable', 'string', 'max:60'],
            'registrations.*.issued_date' => ['nullable', 'date'],
            'registrations.*.expired_date' => ['nullable', 'date'],
            'registrations.*.items' => ['array'],
            'registrations.*.items.*.item_code' => ['nullable', 'string', 'max:100'],
            'registrations.*.items.*.description' => ['nullable', 'string', 'max:255'],
        ], [], ['registrations' => 'daftar izin']);

        $created = $updated = 0;
        $unknownAkl = [];
        $imported = [];
        DB::transaction(function () use ($v, $request, &$created, &$updated, &$unknownAkl, &$imported) {
            foreach ($v['registrations'] as $r) {
                // License holder dari file harus salah satu opsi resmi; selain itu diabaikan.
                if (isset($r['license_holder']) && ! in_array($r['license_holder'], self::LICENSE_HOLDERS, true)) {
                    $match = collect(self::LICENSE_HOLDERS)
                        ->first(fn ($h) => str_contains(mb_strtolower($h), mb_strtolower(trim((string) $r['license_holder']))));
                    $r['license_holder'] = $match;
                }

                $reg = RegulatoryRegistration::withTrashed()->firstOrNew(['akl_number' => trim($r['akl_number'])]);

                // File "list produk saja": izin yang belum terdaftar tidak dibuat tanpa nama.
                if (! $reg->exists && trim((string) ($r['product_name'] ?? '')) === '') {
                    $unknownAkl[] = trim($r['akl_number']);

                    continue;
                }

                $isNew = ! $reg->exists;
                // Hanya isi field yang TERISI di file — file parsial (list produk / header saja)
                // tidak menghapus data header yang sudah ada.
                $fill = collect($r)->except(['items', 'akl_number'])
                    ->map(fn ($x) => is_string($x) ? (trim($x) ?: null) : $x)
                    ->filter(fn ($x) => $x !== null)
                    ->all();
                $reg->fill($fill);
                if ($reg->trashed()) {
                    $reg->restore();
                }
                if ($isNew) {
                    $reg->created_by = $request->user()->id;
                    $created++;
                } else {
                    $updated++;
                }
                $reg->save();
                $imported[] = $r + ['akl_number' => trim($r['akl_number'])];

                // Simpan LAMPIRAN AKL lokal (kode + deskripsi resmi izin) sebagai snapshot —
                // dipakai halaman detail untuk membandingkan deskripsi ERP vs AKL.
                $items = array_values(array_filter($r['items'] ?? [], fn ($i) => trim((string) ($i['item_code'] ?? '')) !== ''));
                if ($items !== []) {
                    $reg->items()->delete();
                    foreach ($items as $i => $item) {
                        $reg->items()->create([
                            'item_code' => trim((string) $item['item_code']),
                            'description' => trim((string) ($item['description'] ?? '')) ?: null,
                            'sort_order' => $i,
                        ]);
                    }
                }
            }
        });

        // Tulis noakl ke produk ERP per kode (di luar transaksi lokal — koneksi berbeda).
        // Hanya untuk izin yang benar-benar tersimpan (unknown AKL dilewati).
        $tagged = 0;
        $unmatched = [];
        try {
            $p = config('erp.prefix');
            foreach ($imported as $r) {
                $codes = collect($r['items'] ?? [])->pluck('item_code')
                    ->map(fn ($c) => trim((string) $c))->filter()->unique()->values();
                if ($codes->isEmpty()) {
                    continue;
                }

                $found = DB::connection(config('erp.connection'))->table($p.'product')
                    ->whereIn(DB::raw('LOWER(ref)'), $codes->map(fn ($c) => mb_strtolower($c))->all())
                    ->pluck('rowid', 'ref');
                $foundLower = [];
                foreach ($found as $ref => $id) {
                    $foundLower[mb_strtolower((string) $ref)] = (int) $id;
                }

                foreach ($codes as $code) {
                    $id = $foundLower[mb_strtolower($code)] ?? null;
                    if ($id === null) {
                        $unmatched[] = $code;

                        continue;
                    }
                    $this->setNoAkl($id, trim($r['akl_number']));
                    $tagged++;
                }
            }
        } catch (Throwable $e) {
            report($e);

            return back()->with('error', "Header izin tersimpan ({$created} baru, {$updated} diperbarui), tapi gagal menulis No. AKL ke produk ERP: ".$e->getMessage());
        }

        $msg = "Impor selesai — {$created} izin baru, {$updated} diperbarui, {$tagged} produk ERP di-tag No. AKL.";
        if ($unmatched !== []) {
            $peek = implode(', ', array_slice(array_unique($unmatched), 0, 5));
            $msg .= ' '.count(array_unique($unmatched))." kode tak ditemukan di produk ERP (mis. {$peek}) — tidak di-tag.";
        }
        if ($unknownAkl !== []) {
            $peek = implode(', ', array_slice(array_unique($unknownAkl), 0, 3));
            $msg .= ' '.count(array_unique($unknownAkl))." No. AKL belum terdaftar & tanpa nama produk (mis. {$peek}) — impor daftar izinnya dulu.";
        }

        return back()->with($unmatched === [] && $unknownAkl === [] ? 'success' : 'error', $msg);
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request, ?int $ignoreId = null): array
    {
        $v = $request->validate([
            'akl_number' => ['required', 'string', 'max:40', 'unique:regulatory_registrations,akl_number'.($ignoreId ? ','.$ignoreId : '')],
            'product_name' => ['required', 'string', 'max:255'],
            'manufacturer' => ['nullable', 'string', 'max:255'],
            'license_holder' => ['nullable', 'in:'.implode(',', self::LICENSE_HOLDERS)],
            'risk_class' => ['nullable', 'string', 'max:60'],
            'category' => ['nullable', 'string', 'max:120'],
            'sub_category' => ['nullable', 'string', 'max:120'],
            'product_type' => ['nullable', 'string', 'max:160'],
            'application_type' => ['nullable', 'string', 'max:60'],
            'issued_date' => ['nullable', 'date'],
            'expired_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:255'],
        ], [], ['akl_number' => 'nomor izin edar', 'product_name' => 'nama produk']);

        return collect($v)->map(fn ($x) => is_string($x) ? (trim($x) ?: null) : $x)->all();
    }
}
