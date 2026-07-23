<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Monitoring Pembelian — total pembelian per principal per tahun, drill-down ke detail item.
 *
 * Sumber: dwh_stg_acc_purchase_invoice_item (faktur pembelian Accurate). Kolom `total` bermata
 * uang campur (IDR lokal, USD impor), jadi konversi ke IDR memakai dwh_fx_rate per (mata uang,
 * bulan); IDR = 1. Kurs yang belum terisi jatuh ke DEFAULT_RATE (asumsi, ditandai di UI).
 *
 * Principal diturunkan dari vendor lewat dwh_map_vendor_principal; vendor tak berprincipal
 * tampil dengan namanya sendiri (bukan disembunyikan) agar total tetap tie-back ke pembelian.
 */
class PurchaseMonitorController extends Controller
{
    /** Kurs cadangan bila dwh_fx_rate belum punya baris untuk (mata uang, bulan) itu. */
    protected const DEFAULT_RATE = 16000;

    /** Label principal efektif: nama principal bila terpetakan, selain itu nama vendor. */
    protected const PRINCIPAL_LABEL = 'COALESCE(p.name, s.vendor_name)';

    /** Ekspresi nilai IDR per baris: IDR apa adanya, mata uang lain dikali kurs bulan itu. */
    protected function idrExpr(): string
    {
        return "s.total * CASE WHEN s.currency_code IS NULL OR s.currency_code = 'IDR' THEN 1
                ELSE COALESCE(fx.rate_to_idr, ".self::DEFAULT_RATE.") END";
    }

    /** Query pembelian + join mapping vendor/principal + kurs. */
    protected function base()
    {
        return DB::table('dwh_stg_acc_purchase_invoice_item as s')
            ->leftJoin('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 's.vendor_name')
            ->leftJoin('pricing_principals as p', 'p.id', '=', 'm.principal_id')
            ->leftJoin('dwh_fx_rate as fx', function ($j) {
                $j->on('fx.currency', '=', 's.currency_code')->on('fx.period', '=', DB::raw('LEFT(s.trans_date, 7)'));
            });
    }

    public function index(): Response
    {
        // Agregasi mentah: per (principal, tahun, mata uang) → nilai asli + nilai IDR.
        $rows = $this->base()
            ->selectRaw(self::PRINCIPAL_LABEL.' AS principal, LEFT(s.trans_date,4) AS tahun, s.currency_code AS cur,
                SUM(s.total) AS asli, SUM('.$this->idrExpr().') AS idr, COUNT(*) AS n,
                MAX(m.principal_id IS NOT NULL) AS is_mapped')
            ->whereNotNull('s.trans_date')
            ->groupBy('principal', 'tahun', 'cur')
            ->get();

        $years = $rows->pluck('tahun')->unique()->sort()->values();

        // Pivot principal × tahun (nilai IDR), plus rincian mata uang asli & total.
        $byPrincipal = [];
        foreach ($rows as $r) {
            $key = $r->principal ?? '(Tanpa Vendor)';
            $byPrincipal[$key] ??= ['principal' => $key, 'is_mapped' => false, 'years' => [], 'currencies' => [], 'total_idr' => 0.0, 'n' => 0];
            $byPrincipal[$key]['years'][$r->tahun] = ($byPrincipal[$key]['years'][$r->tahun] ?? 0) + (float) $r->idr;
            $byPrincipal[$key]['currencies'][$r->cur ?? 'IDR'] = ($byPrincipal[$key]['currencies'][$r->cur ?? 'IDR'] ?? 0) + (float) $r->asli;
            $byPrincipal[$key]['total_idr'] += (float) $r->idr;
            $byPrincipal[$key]['n'] += (int) $r->n;
            $byPrincipal[$key]['is_mapped'] = $byPrincipal[$key]['is_mapped'] || (bool) $r->is_mapped;
        }
        $principals = collect($byPrincipal)->sortByDesc('total_idr')->values();

        return Inertia::render('purchase-monitor/index', [
            'years' => $years,
            'principals' => $principals,
            'summary' => [
                'total_idr' => (float) $principals->sum('total_idr'),
                'n_principal' => $principals->count(),
                'n_mapped' => $principals->where('is_mapped', true)->count(),
                'n_lines' => (int) $principals->sum('n'),
            ],
            'fx' => $this->fxStatus(),
        ]);
    }

    /** Detail item pembelian untuk satu principal + tahun (drill-down). */
    public function drilldown(Request $request): JsonResponse
    {
        $principal = (string) $request->input('principal');
        $year = (string) $request->input('year');

        $items = $this->base()
            ->whereRaw(self::PRINCIPAL_LABEL.' = ?', [$principal])
            ->whereRaw('LEFT(s.trans_date,4) = ?', [$year])
            ->orderByDesc('s.trans_date')
            ->limit(2000)
            ->selectRaw('s.trans_date, s.doc_number, s.vendor_name, s.item_no, s.item_name, s.qty, s.unit,
                s.currency_code AS cur, s.total AS asli, '.$this->idrExpr().' AS idr,
                COALESCE(fx.rate_to_idr, CASE WHEN s.currency_code IS NULL OR s.currency_code=\'IDR\' THEN 1 ELSE '.self::DEFAULT_RATE.' END) AS rate')
            ->get()
            ->map(fn ($r) => [
                'trans_date' => $r->trans_date, 'doc_number' => $r->doc_number, 'vendor_name' => $r->vendor_name,
                'item_no' => $r->item_no, 'item_name' => $r->item_name, 'qty' => (float) $r->qty, 'unit' => $r->unit,
                'currency' => $r->cur ?? 'IDR', 'asli' => (float) $r->asli, 'rate' => (float) $r->rate, 'idr' => (float) $r->idr,
            ]);

        return response()->json(['items' => $items]);
    }

    /** Normalisasi nama vendor/supplier agar bisa dicocokkan lintas sistem. */
    protected function normSql(string $col): string
    {
        return "REPLACE(REPLACE(REPLACE(REPLACE(LOWER($col),' ',''),'.',''),',',''),'pt','')";
    }

    /**
     * Rekonsiliasi pembelian Accurate vs Dolibarr per vendor × tahun × mata uang.
     *
     * Kedua sistem tak berbagi kunci dokumen (nomor Accurate ≠ ref Dolibarr), jadi pencocokan
     * memakai nama vendor ternormalisasi + tahun + mata uang, dan membandingkan NILAI ASLI
     * (bukan IDR — kurs Dolibarr tak andal). Tiap baris ditandai: cocok / selisih / hanya di
     * salah satu sisi.
     */
    public function reconciliation(): Response
    {
        // Sisi Accurate (mata uang dari mapping vendor).
        $acc = DB::table('dwh_stg_acc_purchase_invoice_item as s')
            ->whereNotNull('s.trans_date')
            ->groupBy('s.vendor_name', 'norm', 'tahun', 'cur')
            ->selectRaw('s.vendor_name, '.$this->normSql('s.vendor_name').' AS norm, LEFT(s.trans_date,4) AS tahun,
                COALESCE(s.currency_code,\'IDR\') AS cur, SUM(s.total) AS total, COUNT(DISTINCT s.doc_number) AS docs')
            ->get();

        // Sisi Dolibarr (nilai asli = multicurrency_total_ttc, mata uang = multicurrency_code).
        $p = config('erp.prefix');
        $dol = collect(DB::connection(config('erp.connection'))->select("
            SELECT so.nom AS vendor_name, ".$this->normSql('so.nom')." AS norm,
                   LEFT(f.datef,4) AS tahun, COALESCE(NULLIF(f.multicurrency_code,''),'IDR') AS cur,
                   SUM(f.multicurrency_total_ttc) AS total, COUNT(*) AS docs
            FROM {$p}facture_fourn f
            LEFT JOIN {$p}societe so ON so.rowid = f.fk_soc
            WHERE f.datef IS NOT NULL
            GROUP BY so.nom, norm, tahun, cur
        "));

        // Gabung berdasarkan (norm, tahun, mata uang).
        $merged = [];
        $key = fn ($r) => $r->norm.'|'.$r->tahun.'|'.$r->cur;
        foreach ($acc as $r) {
            $merged[$key($r)] = ['vendor' => $r->vendor_name, 'tahun' => $r->tahun, 'cur' => $r->cur,
                'acc' => (float) $r->total, 'acc_docs' => (int) $r->docs, 'dol' => 0.0, 'dol_docs' => 0];
        }
        foreach ($dol as $r) {
            $k = $key($r);
            $merged[$k] ??= ['vendor' => $r->vendor_name, 'tahun' => $r->tahun, 'cur' => $r->cur,
                'acc' => 0.0, 'acc_docs' => 0, 'dol' => 0.0, 'dol_docs' => 0];
            $merged[$k]['dol'] = (float) $r->total;
            $merged[$k]['dol_docs'] = (int) $r->docs;
            $merged[$k]['vendor'] = $merged[$k]['vendor'] ?: $r->vendor_name;
        }

        $rows = collect($merged)->map(function ($m) {
            $diff = round($m['acc'] - $m['dol'], 2);
            $m['selisih'] = $diff;
            $m['status'] = $m['dol'] == 0 ? 'acc_only' : ($m['acc'] == 0 ? 'dol_only' : (abs($diff) < 1 ? 'match' : 'diff'));

            return $m;
        })->sortBy([['tahun', 'desc'], ['vendor', 'asc']])->values();

        return Inertia::render('purchase-monitor/reconciliation', [
            'rows' => $rows,
            'years' => $rows->pluck('tahun')->unique()->sort()->values(),
            'summary' => [
                'match' => $rows->where('status', 'match')->count(),
                'diff' => $rows->where('status', 'diff')->count(),
                'acc_only' => $rows->where('status', 'acc_only')->count(),
                'dol_only' => $rows->where('status', 'dol_only')->count(),
            ],
        ]);
    }

    /** Halaman kelola: mapping vendor→principal + mata uang, dan kurs per bulan. */
    public function settings(): Response
    {
        // Vendor dari staging + statistik + mapping saat ini.
        $vendors = DB::table('dwh_stg_acc_purchase_invoice_item as s')
            ->leftJoin('dwh_map_vendor_principal as m', 'm.vendor_name', '=', 's.vendor_name')
            ->whereNotNull('s.vendor_name')
            ->groupBy('s.vendor_name', 'm.principal_id', 'm.default_currency')
            ->selectRaw('s.vendor_name, COUNT(*) n_lines, ROUND(SUM(s.total),2) total_asli,
                m.principal_id, COALESCE(m.default_currency, \'IDR\') default_currency')
            ->orderByDesc(DB::raw('COUNT(*)'))
            ->get();

        return Inertia::render('purchase-monitor/settings', [
            'vendors' => $vendors,
            'principals' => DB::table('pricing_principals')->where('is_active', 1)->orderBy('name')->get(['id', 'name']),
            'fxRates' => DB::table('dwh_fx_rate')->orderByDesc('period')->orderBy('currency')
                ->get(['id', 'currency', 'period', 'rate_to_idr', 'source', 'note']),
            'currencies' => ['IDR', 'USD', 'EUR', 'SGD', 'CNY', 'JPY', 'GBP'],
        ]);
    }

    /** Simpan mapping satu vendor + turunkan mata uang ke baris staging-nya. */
    public function storeMapping(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'vendor_name' => ['required', 'string'],
            'principal_id' => ['nullable', 'integer', 'exists:pricing_principals,id'],
            'default_currency' => ['required', 'string', 'size:3'],
        ]);

        // Mata uang yang diset lewat UI = manual → dilindungi dari tebakan ulang saat sync.
        DB::table('dwh_map_vendor_principal')->updateOrInsert(
            ['vendor_name' => $data['vendor_name']],
            ['principal_id' => $data['principal_id'] ?? null, 'default_currency' => $data['default_currency'],
                'currency_source' => 'manual', 'updated_at' => now(), 'created_at' => now()],
        );

        // Selaraskan mata uang baris pembelian vendor ini (kecuali yang sudah dari dokumen).
        DB::table('dwh_stg_acc_purchase_invoice_item')->where('vendor_name', $data['vendor_name'])
            ->update(['currency_code' => $data['default_currency']]);

        return back()->with('success', 'Mapping vendor disimpan.');
    }

    /**
     * Ambil kurs historis via command fx:fetch dari tombol (tanpa akses terminal server).
     * Sinkron: tiap bulan satu panggilan API, jadi rentang penuh bisa belasan detik.
     */
    public function fetchFx(Request $request): RedirectResponse
    {
        @set_time_limit(0);
        $currency = strtoupper((string) $request->input('currency', 'USD'));

        try {
            $exit = Artisan::call('fx:fetch', array_filter(['--currency' => $currency]));
        } catch (\Throwable $e) {
            return back()->with('error', 'Gagal mengambil kurs: '.$e->getMessage());
        }

        // Ringkasan diambil dari baris terakhir output command ("Selesai: X ..., Y gagal.").
        $summary = collect(preg_split('/\r?\n/', trim(Artisan::output())))->last() ?: '';

        return $exit === 0
            ? back()->with('success', 'Kurs diperbarui. '.$summary)
            : back()->with('error', 'Sebagian/semua kurs gagal diambil (server perlu akses internet). '.$summary);
    }

    /** Simpan/timpa kurs sebuah (mata uang, bulan) — ditandai manual. */
    public function storeFx(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'currency' => ['required', 'string', 'size:3'],
            'period' => ['required', 'string', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
            'rate_to_idr' => ['required', 'numeric', 'min:0'],
        ]);

        DB::table('dwh_fx_rate')->updateOrInsert(
            ['currency' => strtoupper($data['currency']), 'period' => $data['period']],
            ['rate_to_idr' => $data['rate_to_idr'], 'source' => 'manual', 'note' => 'diisi manual', 'updated_at' => now(), 'created_at' => now()],
        );

        return back()->with('success', 'Kurs disimpan.');
    }

    /** Ambang harga satuan: baris < 600rb khas USD, ≥ 600rb khas IDR. */
    protected const USD_LINE_THRESHOLD = 600000;

    /**
     * Selaraskan mapping dengan staging: daftarkan vendor baru, tebak mata uang vendor 'auto'
     * (dominan < 600rb → USD), lalu turunkan currency_code ke SEMUA baris. Vendor yang mata
     * uangnya diset manual tidak diganggu. Idempoten — aman dijalankan tiap habis sync.
     */
    public function refreshVendors(): RedirectResponse
    {
        $t = self::USD_LINE_THRESHOLD;

        $added = DB::affectingStatement('
            INSERT IGNORE INTO dwh_map_vendor_principal (vendor_name, default_currency, currency_source, created_at, updated_at)
            SELECT DISTINCT vendor_name, \'IDR\', \'auto\', NOW(), NOW()
            FROM dwh_stg_acc_purchase_invoice_item WHERE vendor_name IS NOT NULL
        ');

        // Tebak mata uang per vendor via aturan DOMINAN (bukan per baris) — hanya yang 'auto'.
        DB::statement("
            UPDATE dwh_map_vendor_principal m
            JOIN (
                SELECT vendor_name, CASE WHEN SUM(total < {$t}) > SUM(total >= {$t}) THEN 'USD' ELSE 'IDR' END cur
                FROM dwh_stg_acc_purchase_invoice_item GROUP BY vendor_name
            ) g ON g.vendor_name = m.vendor_name
            SET m.default_currency = g.cur, m.updated_at = NOW()
            WHERE m.currency_source = 'auto'
        ");

        // Turunkan mata uang ke seluruh baris (data hasil sync tak menyimpan currency sendiri).
        DB::statement('
            UPDATE dwh_stg_acc_purchase_invoice_item s
            JOIN dwh_map_vendor_principal m ON m.vendor_name = s.vendor_name
            SET s.currency_code = m.default_currency
        ');

        return back()->with('success', $added > 0 ? "{$added} vendor baru ditambahkan; mata uang & konversi diperbarui." : 'Mata uang & konversi diperbarui.');
    }

    /** Ringkasan kualitas kurs: berapa bulan-mata-uang masih asumsi vs sumber eksternal. */
    protected function fxStatus(): array
    {
        $bySource = DB::table('dwh_fx_rate')->selectRaw('source, COUNT(*) n')->groupBy('source')->pluck('n', 'source');

        return [
            'manual' => (int) ($bySource['manual'] ?? 0),
            'external' => (int) ($bySource['external'] ?? 0),
            'default_rate' => self::DEFAULT_RATE,
        ];
    }
}
