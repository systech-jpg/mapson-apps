<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Master config ABC: pemetaan akun GL → pool aktivitas dengan split %.
 *
 * Di sinilah asumsi manajemen (yang tak diketahui Accurate) ditetapkan — terutama
 * split gaji per departemen & porsi gedung untuk gudang. Menyunting di sini mengubah
 * seluruh angka P&L per produk lewat CostAllocationService (satu engine).
 *
 * INVARIANT dijaga: total % per akun = 100 (divalidasi di store).
 */
class CostMappingController extends Controller
{
    protected const EXPENSE_TYPES = ['EXPENSE', 'OTHER_EXPENSE', 'COGS'];

    public function index(): Response
    {
        $pools = DB::table('dwh_dim_cost_pool')->orderBy('sort_order')
            ->get(['code', 'name', 'cost_type', 'product_driver', 'is_active', 'note']);

        // Alokasi versi dasar ('2000-01') per akun — versi berperiode menyusul.
        $alloc = DB::table('dwh_map_cost_allocation')
            ->where('effective_from', '2000-01')
            ->get(['account_code', 'cost_pool_code', 'pct', 'note'])
            ->groupBy('account_code');

        // Akun beban + total nilai (semua periode) untuk konteks bobot.
        $totals = DB::table('dwh_stg_gl')
            ->selectRaw('account_code, SUM(amount) total')
            ->groupBy('account_code')->pluck('total', 'account_code');

        $accounts = DB::table('dwh_stg_acc_glaccount')
            ->whereIn('account_type', self::EXPENSE_TYPES)
            ->orderByRaw('ABS(COALESCE((SELECT SUM(amount) FROM dwh_stg_gl g WHERE g.account_code = dwh_stg_acc_glaccount.no),0)) DESC')
            ->get(['no', 'name', 'account_type', 'parent_name'])
            ->map(function ($a) use ($alloc, $totals) {
                $rows = ($alloc[$a->no] ?? collect())->map(fn ($r) => [
                    'pool' => $r->cost_pool_code, 'pct' => (float) $r->pct,
                ])->values();

                return [
                    'code' => $a->no,
                    'name' => $a->name,
                    'type' => $a->account_type,
                    'parent' => $a->parent_name,
                    'total' => (float) ($totals[$a->no] ?? 0),
                    'allocation' => $rows,
                    'sum' => round($rows->sum('pct'), 2),
                    'is_default' => (bool) ($alloc[$a->no] ?? collect())->contains(fn ($r) => str_contains((string) $r->note, '[DEFAULT]')),
                ];
            })
            // Sembunyikan akun COA tanpa transaksi GL & tanpa alokasi (0 rupiah, cuma noise).
            ->filter(fn ($a) => abs($a['total']) > 0.009 || count($a['allocation']) > 0)
            ->values();

        return Inertia::render('data-warehouse/cost-mapping', [
            'pools' => $pools,
            'accounts' => $accounts,
        ]);
    }

    /**
     * Simpan alokasi satu akun (ganti total versi dasar). Total % wajib 100
     * (atau 0 baris = kosongkan). Menjaga invariant tie-back GL.
     */
    public function storeAllocation(Request $request): RedirectResponse
    {
        $poolCodes = DB::table('dwh_dim_cost_pool')->pluck('code')->all();

        $data = $request->validate([
            'account_code' => ['required', 'string', 'exists:dwh_stg_acc_glaccount,no'],
            'rows' => ['array'],
            'rows.*.pool' => ['required', 'string', 'in:'.implode(',', $poolCodes)],
            'rows.*.pct' => ['required', 'numeric', 'min:0', 'max:100'],
        ]);

        $rows = collect($data['rows'] ?? []);

        // Pool tak boleh dobel dalam satu akun.
        if ($rows->pluck('pool')->duplicates()->isNotEmpty()) {
            return back()->withErrors(['rows' => 'Pool tidak boleh berulang dalam satu akun.']);
        }
        // Sum harus 100 (kecuali kosong = menghapus alokasi akun ini).
        $sum = round($rows->sum('pct'), 2);
        if ($rows->isNotEmpty() && abs($sum - 100) > 0.01) {
            return back()->withErrors(['rows' => "Total persentase harus 100% (sekarang {$sum}%)."]);
        }

        DB::transaction(function () use ($data, $rows) {
            DB::table('dwh_map_cost_allocation')
                ->where('account_code', $data['account_code'])->where('effective_from', '2000-01')->delete();

            $now = now();
            $insert = $rows->map(fn ($r) => [
                'account_code' => $data['account_code'],
                'cost_pool_code' => $r['pool'],
                'pct' => $r['pct'],
                'effective_from' => '2000-01',
                'note' => null, // disunting manusia → buang tanda [DEFAULT]
                'created_at' => $now, 'updated_at' => $now,
            ])->all();

            if ($insert) {
                DB::table('dwh_map_cost_allocation')->insert($insert);
            }
        });

        return back()->with('success', 'Alokasi akun '.$data['account_code'].' disimpan.');
    }
}
