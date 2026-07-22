<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Dwh\GlDescriptionParser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Klasifikasi GL bottom-up → taksonomi CapEx/OpEx → departemen.
 *
 * Penandaan per AKUN (cepat, menutup mayoritas) + override per RECORD (untuk akun campur
 * seperti BBM: sales/TS/gudang, atau Renovasi=CapEx di akun Office Maintenance).
 * Record dikunci lewat HASH ISI baris agar bertahan saat GL diimpor ulang.
 */
class GlClassificationController extends Controller
{
    /** Ekspresi hash isi baris — identitas stabil sebuah record GL lintas impor. */
    protected const ROW_HASH = "MD5(CONCAT_WS('|', g.account_code, COALESCE(g.doc_no,''), COALESCE(g.description,''), CAST(g.debit AS CHAR), CAST(g.credit AS CHAR)))";

    /** Universe klasifikasi = pengeluaran & belanja modal (bukan kas/AR/AP/pendapatan/inventory). */
    protected const COST_TYPES = ['EXPENSE', 'OTHER_EXPENSE', 'COGS', 'FIXED_ASSET'];

    public function index(Request $request): Response
    {
        [$year, $month] = $this->period($request);

        $tree = DB::table('dwh_dim_gl_category')->orderBy('sort_order')
            ->get(['id', 'parent_id', 'code', 'name', 'kind']);

        // Jumlah record per akun yang punya override (row-scope) — dihitung DULU.
        $ov = DB::table('dwh_stg_gl as g')
            ->join('dwh_map_gl_classification as m', fn ($j) => $j->on('m.match_key', '=', DB::raw(self::ROW_HASH))->where('m.scope', 'row'))
            ->tap(fn ($q) => $this->applyPeriod($q, $year, $month))
            ->groupBy('g.account_code')->selectRaw('g.account_code, COUNT(*) n')->pluck('n', 'account_code');

        // SEMUA akun GL (bukan hanya biaya). Akun biaya/aset diprioritaskan di urutan
        // supaya praktis diklasifikasi, tapi akun neraca/pendapatan tetap ikut tampil.
        $costList = "'".implode("','", self::COST_TYPES)."'";
        $accounts = DB::table('dwh_stg_gl as g')
            ->leftJoin('dwh_stg_acc_glaccount as c', 'c.no', '=', 'g.account_code')
            ->leftJoin('dwh_map_gl_classification as m', fn ($j) => $j->on('m.match_key', '=', 'g.account_code')->where('m.scope', 'account'))
            ->tap(fn ($q) => $this->applyPeriod($q, $year, $month))
            ->groupBy('g.account_code')
            ->selectRaw('g.account_code, MAX(c.name) nama, MAX(c.account_type) tipe, SUM(g.amount) total, COUNT(*) n_rows, MAX(m.category_id) category_id, MAX(m.is_operational_expense) is_opex')
            ->orderByRaw("MAX(CASE WHEN c.account_type IN ($costList) THEN 1 ELSE 0 END) DESC, ABS(SUM(g.amount)) DESC")
            ->get()
            ->map(fn ($a) => [
                'code' => $a->account_code, 'name' => $a->nama, 'type' => $a->tipe,
                'total' => (float) $a->total, 'rows' => (int) $a->n_rows,
                'category_id' => $a->category_id ? (int) $a->category_id : null,
                'is_opex' => $a->is_opex === null ? null : (bool) $a->is_opex,
                'overrides' => (int) ($ov[$a->account_code] ?? 0),
            ])->values();

        return Inertia::render('data-warehouse/gl-classification', [
            'tree' => $tree,
            'accounts' => $accounts,
            'summary' => $this->summary($year, $month),
            'periods' => DB::table('dwh_stg_gl')->distinct()->orderBy('period')->pluck('period'),
            'filter' => ['year' => $year, 'month' => $month],
        ]);
    }

    /** Ambil & validasi filter periode dari request → [year|null, month|null]. */
    protected function period(Request $request): array
    {
        $year = $request->input('year');
        $month = $request->input('month');
        $year = ($year && preg_match('/^\d{4}$/', $year)) ? $year : null;
        $month = ($year && $month && preg_match('/^(0[1-9]|1[0-2])$/', $month)) ? $month : null;

        return [$year, $month];
    }

    /** Batasi query dwh_stg_gl (alias g) ke tahun/bulan terpilih. */
    protected function applyPeriod($query, ?string $year, ?string $month): void
    {
        if (! $year) {
            return;
        }
        $month ? $query->where('g.period', "$year-$month") : $query->where('g.period', 'like', "$year-%");
    }

    /**
     * Ringkasan: CapEx & OpEx dari taksonomi (klasifikasi efektif override>akun), plus
     * Operational Expense dari FLAG (dimensi terpisah, account-scope).
     */
    protected function summary(?string $year = null, ?string $month = null): array
    {
        // Baris TANPA pecahan — klasifikasi efektif: override baris > akun.
        $kind = DB::table('dwh_stg_gl as g')
            ->leftJoin('dwh_map_gl_classification as mr', fn ($j) => $j->on('mr.match_key', '=', DB::raw(self::ROW_HASH))->where('mr.scope', 'row'))
            ->leftJoin('dwh_map_gl_classification as ma', fn ($j) => $j->on('ma.match_key', '=', 'g.account_code')->where('ma.scope', 'account'))
            ->leftJoin('dwh_dim_gl_category as cat', 'cat.id', '=', DB::raw('COALESCE(mr.category_id, ma.category_id)'))
            ->leftJoin('dwh_gl_row_split as sp', 'sp.row_hash', '=', DB::raw(self::ROW_HASH))
            ->tap(fn ($q) => $this->applyPeriod($q, $year, $month))
            ->whereNull('sp.id')
            ->whereNotNull('cat.kind')
            ->selectRaw('cat.kind, SUM(ABS(g.amount)) total')
            ->groupBy('cat.kind')->pluck('total', 'kind');

        // Baris YANG DIPECAH — pakai kategori & nominal tiap sub-transaksi.
        $splitKind = DB::table('dwh_stg_gl as g')
            ->join('dwh_gl_row_split as sp', 'sp.row_hash', '=', DB::raw(self::ROW_HASH))
            ->join('dwh_dim_gl_category as cat', 'cat.id', '=', 'sp.category_id')
            ->tap(fn ($q) => $this->applyPeriod($q, $year, $month))
            ->selectRaw('cat.kind, SUM(ABS(sp.amount)) total')
            ->groupBy('cat.kind')->pluck('total', 'kind');

        $opexFlag = (float) DB::table('dwh_stg_gl as g')
            ->join('dwh_map_gl_classification as m', fn ($j) => $j->on('m.match_key', '=', 'g.account_code')->where('m.scope', 'account')->where('m.is_operational_expense', 1))
            ->tap(fn ($q) => $this->applyPeriod($q, $year, $month))
            ->sum(DB::raw('ABS(g.amount)'));

        return [
            'capex' => (float) ($kind['capex'] ?? 0) + (float) ($splitKind['capex'] ?? 0),
            'opex' => (float) ($kind['opex'] ?? 0) + (float) ($splitKind['opex'] ?? 0),
            'operational_expense' => $opexFlag,
        ];
    }

    /** Record satu akun (untuk override), + klasifikasi efektif tiap baris. */
    public function rows(Request $request): JsonResponse
    {
        $code = (string) $request->input('account_code');

        $rows = DB::table('dwh_stg_gl as g')
            ->leftJoin('dwh_map_gl_classification as mr', fn ($j) => $j->on('mr.match_key', '=', DB::raw(self::ROW_HASH))->where('mr.scope', 'row'))
            ->leftJoinSub(
                DB::table('dwh_gl_row_split')->groupBy('row_hash')->selectRaw('row_hash, COUNT(*) n'),
                'sp',
                fn ($j) => $j->on('sp.row_hash', '=', DB::raw(self::ROW_HASH)),
            )
            ->where('g.account_code', $code)
            ->orderBy('g.period')->orderByDesc('g.debit')
            ->limit(1000)
            ->selectRaw(self::ROW_HASH.' row_hash, g.period, g.doc_no, g.description, g.debit, g.credit, g.amount, mr.category_id, sp.n split_count')
            ->get()
            ->map(fn ($r) => [
                'hash' => $r->row_hash, 'period' => $r->period, 'doc_no' => $r->doc_no,
                'description' => $r->description, 'debit' => (float) $r->debit, 'credit' => (float) $r->credit,
                'amount' => (float) $r->amount,
                'category_id' => $r->category_id ? (int) $r->category_id : null,
                'splits' => (int) ($r->split_count ?? 0),
            ]);

        return response()->json(['rows' => $rows]);
    }

    /**
     * Rincian pecah-baris: sub-item hasil baca memo + usulan subset yang jumlahnya pas dengan
     * nilai baris. Bila sudah pernah dipecah, kembalikan split tersimpan (bukan usulan).
     */
    public function splitDetail(Request $request, GlDescriptionParser $parser): JsonResponse
    {
        $hash = (string) $request->input('hash');

        $row = DB::table('dwh_stg_gl as g')->whereRaw(self::ROW_HASH.' = ?', [$hash])
            ->selectRaw('g.description, g.amount, g.debit')->first();

        if (! $row) {
            return response()->json(['message' => 'Baris GL tidak ditemukan.'], 404);
        }

        $saved = DB::table('dwh_gl_row_split')->where('row_hash', $hash)->orderBy('sort_order')
            ->get(['label', 'amount', 'category_id'])
            ->map(fn ($s) => [
                'label' => $s->label, 'amount' => (float) $s->amount,
                'category_id' => $s->category_id ? (int) $s->category_id : null,
            ]);

        $items = $parser->parse($row->description);
        $suggest = $parser->suggest($items, (float) $row->amount);

        return response()->json([
            'target' => (float) $row->amount,
            'items' => $items,
            'suggested' => $suggest['selected'],
            'ambiguous' => $suggest['ambiguous'],
            'saved' => $saved,
        ]);
    }

    /**
     * Simpan pecahan sebuah baris. Total WAJIB sama dengan nilai baris agar laporan tetap
     * tie-back ke GL; kirim daftar kosong untuk membatalkan pecahan.
     */
    public function storeSplit(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'hash' => ['required', 'string', 'size:32'],
            'items' => ['present', 'array'],
            'items.*.label' => ['required', 'string', 'max:255'],
            'items.*.amount' => ['required', 'numeric'],
            'items.*.category_id' => ['nullable', 'integer', 'exists:dwh_dim_gl_category,id'],
        ]);

        $row = DB::table('dwh_stg_gl as g')->whereRaw(self::ROW_HASH.' = ?', [$data['hash']])
            ->selectRaw('g.amount')->first();

        if (! $row) {
            return back()->withErrors(['hash' => 'Baris GL tidak ditemukan.']);
        }

        // Batalkan pecahan.
        if ($data['items'] === []) {
            DB::table('dwh_gl_row_split')->where('row_hash', $data['hash'])->delete();

            return back()->with('success', 'Pecahan baris dibatalkan.');
        }

        $sum = round(array_sum(array_column($data['items'], 'amount')), 2);
        $target = round((float) $row->amount, 2);

        if (abs($sum - $target) > 0.01) {
            return back()->withErrors([
                'items' => 'Total pecahan ('.number_format($sum, 0, ',', '.').') harus sama dengan nilai baris ('.number_format($target, 0, ',', '.').').',
            ]);
        }

        DB::transaction(function () use ($data) {
            DB::table('dwh_gl_row_split')->where('row_hash', $data['hash'])->delete();
            DB::table('dwh_gl_row_split')->insert(collect($data['items'])->values()->map(fn ($it, $i) => [
                'row_hash' => $data['hash'],
                'label' => $it['label'],
                'amount' => $it['amount'],
                'category_id' => $it['category_id'] ?? null,
                'sort_order' => $i,
                'created_at' => now(), 'updated_at' => now(),
            ])->all());
        });

        return back()->with('success', 'Baris dipecah menjadi '.count($data['items']).' sub-transaksi.');
    }

    /** Set/hapus klasifikasi sebuah AKUN (kategori + flag operational-expense). */
    public function storeAccount(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'account_code' => ['required', 'string'],
            'category_id' => ['nullable', 'integer', 'exists:dwh_dim_gl_category,id'],
            'is_operational_expense' => ['nullable', 'boolean'],
        ]);
        $catId = $data['category_id'] ?? null;
        $opex = ! empty($data['is_operational_expense']);

        if ($catId === null && ! $opex) {
            DB::table('dwh_map_gl_classification')->where('scope', 'account')->where('match_key', $data['account_code'])->delete();
        } else {
            DB::table('dwh_map_gl_classification')->updateOrInsert(
                ['scope' => 'account', 'match_key' => $data['account_code']],
                ['category_id' => $catId, 'is_operational_expense' => $opex ? 1 : null, 'updated_at' => now(), 'created_at' => now()],
            );
        }

        return back()->with('success', 'Klasifikasi akun disimpan.');
    }

    /** Set/hapus override sebuah RECORD (via hash). */
    public function storeRow(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'hash' => ['required', 'string', 'size:32'],
            'category_id' => ['nullable', 'integer', 'exists:dwh_dim_gl_category,id'],
        ]);
        $this->upsert('row', $data['hash'], $data['category_id']);

        return back()->with('success', 'Override record disimpan.');
    }

    protected function upsert(string $scope, string $key, ?int $categoryId): void
    {
        if ($categoryId === null) {
            DB::table('dwh_map_gl_classification')->where('scope', $scope)->where('match_key', $key)->delete();

            return;
        }
        DB::table('dwh_map_gl_classification')->updateOrInsert(
            ['scope' => $scope, 'match_key' => $key],
            ['category_id' => $categoryId, 'updated_at' => now(), 'created_at' => now()],
        );
    }
}
