<?php

namespace App\Services\Dwh;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Engine Activity-Based Costing (cost object = PRODUK). SATU sumber kebenaran —
 * dipanggil semua view (tab Cost, tab Warehouse, Analisa Produk) supaya angka konsisten.
 *
 * Tahap-1 (resource → pool): opex GL (EXPENSE + OTHER_EXPENSE) didistribusi ke pool
 * lewat dwh_map_cost_allocation (split % ber-periode). INVARIANT: total pool = total opex
 * GL periode itu (tie-back 100%). COGS TIDAK ikut di sini — ditangani terpisah lewat HPP
 * per produk (dwh_map_product_cost), karena COGS ≠ pembelian.
 *
 * Tahap-2 (pool → produk): menyusul (driver qty_stock / qty_sent / qty_used).
 */
class CostAllocationService
{
    /** Tipe akun yang dianggap OPEX (didistribusi ke pool). COGS ditangani via HPP. */
    protected const OPEX_TYPES = ['EXPENSE', 'OTHER_EXPENSE'];

    /**
     * Aturan alokasi yang BERLAKU untuk sebuah periode: per akun, ambil versi dengan
     * effective_from terbesar yang <= periode. Return: [account_code => [[pool,pct], …]].
     *
     * @return array<string, list<array{pool: string, pct: float}>>
     */
    public function allocationFor(string $period): array
    {
        $all = DB::table('dwh_map_cost_allocation')
            ->where('effective_from', '<=', $period)
            ->orderBy('account_code')->orderBy('effective_from')
            ->get(['account_code', 'cost_pool_code', 'pct', 'effective_from']);

        // Versi efektif per akun = effective_from terbesar yang tersedia.
        $effVersion = [];
        foreach ($all as $r) {
            $effVersion[$r->account_code] = max($effVersion[$r->account_code] ?? '', $r->effective_from);
        }

        $out = [];
        foreach ($all as $r) {
            if ($r->effective_from !== $effVersion[$r->account_code]) {
                continue; // versi lama, dilewati
            }
            $out[$r->account_code][] = ['pool' => $r->cost_pool_code, 'pct' => (float) $r->pct];
        }

        return $out;
    }

    /**
     * Total Rp per pool untuk sebuah periode (tahap-1). Menyertakan rincian akun penyumbang
     * + jejak opex yang belum terpetakan (semestinya 0 kalau seed lengkap).
     *
     * @return array{
     *   period: string, opex_total: float, allocated_total: float, unmapped_total: float,
     *   pools: list<array{code: string, name: string, cost_type: string, driver: string, total: float}>,
     *   unmapped: list<array{account_code: string, name: string, amount: float}>
     * }
     */
    public function poolTotals(string $period): array
    {
        $alloc = $this->allocationFor($period);

        // Opex GL periode ini per akun (amount = debit - kredit; beban bersaldo debit positif).
        $glAccounts = DB::table('dwh_stg_gl as g')
            ->join('dwh_stg_acc_glaccount as c', 'c.no', '=', 'g.account_code')
            ->where('g.period', $period)
            ->whereIn('c.account_type', self::OPEX_TYPES)
            ->groupBy('g.account_code')
            ->selectRaw('g.account_code, MAX(c.name) nama, SUM(g.amount) amount')
            ->get();

        $poolTotals = [];
        $unmapped = [];
        $opexTotal = 0.0;

        foreach ($glAccounts as $row) {
            $amount = (float) $row->amount;
            $opexTotal += $amount;
            $rules = $alloc[$row->account_code] ?? null;

            if (! $rules) {
                $unmapped[] = ['account_code' => $row->account_code, 'name' => $row->nama, 'amount' => $amount];

                continue;
            }
            foreach ($rules as $r) {
                $poolTotals[$r['pool']] = ($poolTotals[$r['pool']] ?? 0) + $amount * $r['pct'] / 100;
            }
        }

        // Rakit sesuai urutan pool master (pool tanpa nilai tetap tampil = 0).
        $pools = DB::table('dwh_dim_cost_pool')->where('is_active', true)->orderBy('sort_order')->get();
        $poolRows = $pools->map(fn ($p) => [
            'code' => $p->code, 'name' => $p->name, 'cost_type' => $p->cost_type,
            'driver' => $p->product_driver, 'total' => round($poolTotals[$p->code] ?? 0, 2),
        ])->values()->all();

        return [
            'period' => $period,
            'opex_total' => round($opexTotal, 2),
            'allocated_total' => round(array_sum($poolTotals), 2),
            'unmapped_total' => round(array_sum(array_column($unmapped, 'amount')), 2),
            'pools' => $poolRows,
            'unmapped' => $unmapped,
        ];
    }

    /**
     * P&L per PRODUK untuk sebuah periode (tahap-2). Menurunkan tiap pool ke produk
     * lewat driver-nya, lalu menggabung dengan revenue (sales_facts) & COGS (HPP × qty jual).
     *
     * Baris mencakup UNION produk yang: terjual / disimpan / dikirim / dipakai. Produk
     * bersaldo tapi tak terjual tetap muncul (nanggung storage, revenue 0) — inilah tampilan
     * jujur beban stok mati. COGS pakai resolver HPP: exact → strip '-MAP' → kode dasar.
     *
     * @return array<string, mixed>
     */
    public function productPnl(string $period): array
    {
        [$start, $end] = $this->periodRange($period);
        $poolTotals = collect($this->poolTotals($period)['pools'])->keyBy('code');

        // Vektor driver per kode produk.
        $stock = $this->stockQtyByRef();                 // qty_stock  (saldo terkini)
        [$sent, $used] = $this->erpQtyByRef($start, $end); // qty_sent / qty_used
        $sales = $this->salesByRef($start, $end);         // revenue + qty jual

        $sumStock = array_sum($stock) ?: 0.0;
        $sumSent = array_sum($sent) ?: 0.0;
        $sumUsed = array_sum($used) ?: 0.0;
        $sumRev = array_sum(array_column($sales, 'dpp')) ?: 0.0;

        // Resolver HPP + nama produk.
        $cost = DB::table('dwh_map_product_cost')->pluck('avg_cost', 'item_no');
        $resolveCost = function (string $ref) use ($cost) {
            if (isset($cost[$ref])) {
                return (float) $cost[$ref];
            }
            $base = preg_replace('/-MAP$/', '', $ref);
            return $base !== $ref && isset($cost[$base]) ? (float) $cost[$base] : null;
        };
        $names = $this->nameByRef();

        // Share driver → per pool (denominator 0 → share 0, cost tak jatuh ke mana pun).
        $shareFor = function (string $driver, string $ref) use ($stock, $sent, $used, $sales, $sumStock, $sumSent, $sumUsed, $sumRev): float {
            return match ($driver) {
                'qty_stock' => $sumStock ? ($stock[$ref] ?? 0) / $sumStock : 0,
                'qty_sent' => $sumSent ? ($sent[$ref] ?? 0) / $sumSent : 0,
                'qty_used' => $sumUsed ? ($used[$ref] ?? 0) / $sumUsed : 0,
                'revenue' => $sumRev ? (($sales[$ref]['dpp'] ?? 0) / $sumRev) : 0,
                default => 0, // direct_cost/hpp → lewat COGS, bukan distribusi pool
            };
        };

        $refs = array_values(array_unique(array_merge(
            array_keys($stock), array_keys($sent), array_keys($used), array_keys($sales)
        )));

        $rows = [];
        $poolCheck = [];
        foreach ($refs as $ref) {
            $revenue = (float) ($sales[$ref]['dpp'] ?? 0);
            $qtySold = (float) ($sales[$ref]['qty'] ?? 0);
            $unitCost = $resolveCost($ref);
            $cogs = $unitCost !== null ? round($qtySold * $unitCost, 2) : null;

            $pools = [];
            $direct = 0.0;   // storage+delivery+attend
            $indirect = 0.0; // sales+finance+it+management
            foreach ($poolTotals as $code => $p) {
                if ($p['driver'] === 'direct_cost') {
                    continue;
                }
                $amt = round((float) $p['total'] * $shareFor($p['driver'], $ref), 2);
                if ($amt == 0.0) {
                    continue;
                }
                $pools[$code] = $amt;
                $poolCheck[$code] = ($poolCheck[$code] ?? 0) + $amt;
                $p['cost_type'] === 'direct' ? $direct += $amt : $indirect += $amt;
            }

            $contribution = $cogs === null ? null : round($revenue - $cogs - $direct, 2);
            $net = $cogs === null ? null : round($contribution - $indirect, 2);

            $rows[] = [
                'ref' => $ref,
                'name' => $names[$ref] ?? null,
                'qty_sold' => $qtySold,
                'revenue' => round($revenue, 2),
                'cogs' => $cogs,
                'cogs_missing' => $unitCost === null && $qtySold > 0,
                'unit_cost' => $unitCost !== null ? round($unitCost, 2) : null,
                'pools' => $pools,
                'opex_direct' => round($direct, 2),
                'opex_indirect' => round($indirect, 2),
                'contribution' => $contribution,
                'net' => $net,
            ];
        }

        // Urut: kontribusi terbesar dulu (produk tanpa COGS ditaruh belakang).
        usort($rows, fn ($a, $b) => ($b['contribution'] ?? -INF) <=> ($a['contribution'] ?? -INF));

        return [
            'period' => $period,
            'pools' => $poolTotals->values()->all(),
            'products' => $rows,
            'driver_totals' => [
                'stock' => $sumStock, 'sent' => $sumSent, 'used' => $sumUsed, 'revenue' => round($sumRev, 2),
            ],
            // Tie-back tahap-2: distribusi ke produk = total pool (untuk driver berdenominator>0).
            'pool_distributed' => array_map(fn ($v) => round($v, 2), $poolCheck),
        ];
    }

    /** 'YYYY-MM' → [Y-m-d awal, Y-m-d akhir]. */
    protected function periodRange(string $period): array
    {
        $start = Carbon::createFromFormat('Y-m', $period)->startOfMonth();

        return [$start->toDateString(), (clone $start)->endOfMonth()->toDateString()];
    }

    /** Saldo stok terkini per kode (snapshot Accurate, qty<>0). @return array<string,float> */
    protected function stockQtyByRef(): array
    {
        $latest = DB::table('dwh_fact_inventory_snapshot')->where('source', 'accurate')->max('snapshot_date');
        if (! $latest) {
            return [];
        }

        return DB::table('dwh_fact_inventory_snapshot')
            ->where('source', 'accurate')->where('snapshot_date', $latest)->where('qty', '<>', 0)
            ->groupBy('ref')->selectRaw('ref, SUM(qty) q')->pluck('q', 'ref')
            ->map(fn ($v) => (float) $v)->all();
    }

    /**
     * qty_sent & qty_used per kode produk ERP dalam periode (basis tindakan.tanggal).
     *
     * @return array{0: array<string,float>, 1: array<string,float>}
     */
    protected function erpQtyByRef(string $start, string $end): array
    {
        $conn = config('erp.connection');
        $p = config('erp.prefix');
        $entities = collect((array) config('erp.entities'))->map(fn ($e) => (int) $e)->implode(',') ?: '1';

        $rows = DB::connection($conn)->select(
            "SELECT pr.ref, COALESCE(SUM(d.qty_sent),0) sent, COALESCE(SUM(d.qty_used),0) used
             FROM {$p}tindakan t
             JOIN {$p}usage_report u ON u.fk_tindakan = t.id
             JOIN {$p}usage_report_det d ON d.fk_usage_report = u.rowid
             JOIN {$p}product pr ON pr.rowid = d.fk_product
             WHERE t.entity IN ({$entities}) AND t.tanggal BETWEEN ? AND ?
               AND pr.ref IS NOT NULL AND pr.ref <> ''
             GROUP BY pr.ref",
            [$start, $end]
        );

        $sent = [];
        $used = [];
        foreach ($rows as $r) {
            $sent[$r->ref] = (float) $r->sent;
            $used[$r->ref] = (float) $r->used;
        }

        return [$sent, $used];
    }

    /**
     * Revenue (DPP) & qty terjual per part_number dalam periode (basis invoice_date).
     *
     * @return array<string, array{dpp: float, qty: float}>
     */
    protected function salesByRef(string $start, string $end): array
    {
        return DB::table('sales_facts')
            ->whereNotNull('part_number')->where('part_number', '<>', '')
            ->whereBetween('invoice_date', [$start, $end])
            ->groupBy('part_number')
            ->selectRaw('part_number, SUM(dpp) dpp, SUM(quantity) qty')
            ->get()
            ->mapWithKeys(fn ($r) => [$r->part_number => ['dpp' => (float) $r->dpp, 'qty' => (float) $r->qty]])
            ->all();
    }

    /** Nama produk per kode (prioritas deskripsi penjualan, fallback nama HPP). @return array<string,string> */
    protected function nameByRef(): array
    {
        $names = DB::table('dwh_map_product_cost')->whereNotNull('item_name')->pluck('item_name', 'item_no')->all();
        $sales = DB::table('sales_facts')->whereNotNull('description')->where('description', '<>', '')
            ->selectRaw('part_number, MAX(description) d')->groupBy('part_number')->pluck('d', 'part_number')->all();

        return array_merge($names, $sales); // deskripsi penjualan menang
    }
}
