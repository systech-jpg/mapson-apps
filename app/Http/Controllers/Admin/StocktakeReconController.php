<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\InventorySnapshot;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * 3-way stock reconciliation: ERP vs Accurate (keduanya dari snapshot terakhir di
 * dwh_fact_inventory_snapshot) vs physical stocktake (stocktake_counts), matched on
 * the shared item code.
 */
class StocktakeReconController extends Controller
{
    /** Union of item codes across the three sources, left-joined to each. */
    private function base()
    {
        $erp = fn () => InventorySnapshot::erpStocked()->select('ref', 'label', 'qty', 'principal');
        // Alias ke nama kolom lama (item_no/name/quantity) supaya downstream tak berubah.
        $acc = fn () => InventorySnapshot::accurateInventory()
            ->select('ref as item_no', 'label as name', 'qty as quantity');

        // Kunci union diambil dari kolom asli snapshot (ref), bukan alias di atas.
        $keys = DB::table('stocktake_counts')->select('code as k')
            ->union(InventorySnapshot::erpStocked()->select('ref as k'))
            ->union(InventorySnapshot::accurateInventory()->select('ref as k'));

        return DB::query()->fromSub($keys, 'k')
            ->leftJoinSub($erp(), 'e', 'e.ref', '=', 'k.k')
            ->leftJoinSub($acc(), 'a', 'a.item_no', '=', 'k.k')
            ->leftJoin('stocktake_counts as s', 's.code', '=', 'k.k');
    }

    private function applyFilters($q, Request $request)
    {
        $search = trim((string) $request->input('q', ''));
        $bucket = $request->string('bucket')->toString();

        $q->when($search !== '', fn ($w) => $w->where(fn ($x) => $x
            ->where('k.k', 'like', "%{$search}%")
            ->orWhere('e.label', 'like', "%{$search}%")
            ->orWhere('a.name', 'like', "%{$search}%")
            ->orWhere('s.name', 'like', "%{$search}%")));

        // Buckets compare against the physical count (the baseline of truth).
        match ($bucket) {
            'erp_diff' => $q->whereRaw('COALESCE(e.qty,0) <> COALESCE(s.qty,0)'),
            'acc_diff' => $q->whereRaw('COALESCE(a.quantity,0) <> COALESCE(s.qty,0)'),
            'all_match' => $q->whereRaw('COALESCE(e.qty,0) = COALESCE(s.qty,0) AND COALESCE(a.quantity,0) = COALESCE(s.qty,0)'),
            'no_physical' => $q->whereNull('s.code'),
            default => null,
        };

        return $q;
    }

    private function rowsQuery(Request $request)
    {
        return $this->applyFilters($this->base(), $request)
            ->selectRaw('k.k as code,
                COALESCE(e.label, a.name, s.name) as name,
                COALESCE(e.principal, s.principal) as principal,
                COALESCE(e.qty, 0) as erp_qty,
                COALESCE(a.quantity, 0) as acc_qty,
                COALESCE(s.qty, 0) as st_qty,
                s.code as has_st, e.ref as has_erp, a.item_no as has_acc,
                (COALESCE(e.qty,0) - COALESCE(s.qty,0)) as erp_vs_st,
                (COALESCE(a.quantity,0) - COALESCE(s.qty,0)) as acc_vs_st')
            ->orderByRaw('ABS(COALESCE(e.qty,0) - COALESCE(s.qty,0)) + ABS(COALESCE(a.quantity,0) - COALESCE(s.qty,0)) DESC, k.k ASC');
    }

    public function index(Request $request): Response
    {
        $rows = $this->rowsQuery($request)->paginate(50)->withQueryString();

        $agg = $this->applyFilters($this->base(), $request)->selectRaw('
            COUNT(*) as total,
            SUM(s.code IS NULL) as no_physical,
            SUM(s.code IS NOT NULL AND COALESCE(e.qty,0)=COALESCE(s.qty,0) AND COALESCE(a.quantity,0)=COALESCE(s.qty,0)) as all_match,
            SUM(COALESCE(e.qty,0) <> COALESCE(s.qty,0)) as erp_diff,
            SUM(COALESCE(a.quantity,0) <> COALESCE(s.qty,0)) as acc_diff
        ')->first();

        return Inertia::render('stocktake-recon/index', [
            'rows' => $rows,
            'filters' => ['q' => trim((string) $request->input('q', '')), 'bucket' => $request->string('bucket')->toString()],
            'summary' => [
                'total' => (int) ($agg->total ?? 0),
                'all_match' => (int) ($agg->all_match ?? 0),
                'erp_diff' => (int) ($agg->erp_diff ?? 0),
                'acc_diff' => (int) ($agg->acc_diff ?? 0),
                'no_physical' => (int) ($agg->no_physical ?? 0),
            ],
            'meta' => [
                'counted_at' => DB::table('stocktake_counts')->max('counted_at'),
                'count' => DB::table('stocktake_counts')->count(),
                'erp_snapshot' => InventorySnapshot::latestDate(InventorySnapshot::ERP),
                'acc_snapshot' => InventorySnapshot::latestDate(InventorySnapshot::ACCURATE),
                'data_period' => $this->dataPeriod(),
            ],
            'erp_sessions' => $this->erpSessions(),
        ]);
    }

    /** Stocktake sessions available in the ERP (for the "pull from ERP" picker). */
    private function erpSessions(): array
    {
        try {
            $p = config('erp.prefix');

            return DB::connection(config('erp.connection'))->table($p.'stocktake as t')
                ->leftJoin($p.'stocktake_det as d', 'd.fk_stocktake', '=', 't.rowid')
                ->groupBy('t.rowid', 't.ref', 't.label', 't.stocktake_date', 't.status', 't.period_month', 't.period_year')
                ->orderByDesc('t.period_year')->orderByDesc('t.period_month')->orderByDesc('t.stocktake_date')
                ->get(['t.rowid as id', 't.ref', 't.label', 't.stocktake_date as date', 't.status', 't.period_month', 't.period_year', DB::raw('COUNT(d.rowid) as items')])
                ->map(fn ($r) => (array) $r + ['period' => sprintf('%04d-%02d', (int) $r->period_year, (int) $r->period_month)])
                ->all();
        } catch (\Throwable) {
            return [];
        }
    }

    /** Period (YYYY-MM) the system data represents — analogised from the snapshot date. */
    private function dataPeriod(): ?string
    {
        $snap = InventorySnapshot::latestDate(InventorySnapshot::ACCURATE) ?: InventorySnapshot::latestDate(InventorySnapshot::ERP);

        return $snap ? Carbon::parse($snap)->format('Y-m') : null;
    }

    /** Pull a stocktake session's physical counts from the ERP into stocktake_counts. */
    public function syncFromErp(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'fk_stocktake' => ['required', 'integer'],
            'truncate' => ['nullable', 'boolean'],
        ]);

        $p = config('erp.prefix');
        $erp = DB::connection(config('erp.connection'));

        $session = $erp->table($p.'stocktake')->where('rowid', $data['fk_stocktake'])->first();
        if (! $session) {
            return back()->with('error', 'Sesi stocktake tidak ditemukan di ERP.');
        }

        // Physical = qty_physical, falling back to rak+tray+container when physical is 0.
        $qtyExpr = '(CASE WHEN d.qty_physical <> 0 THEN d.qty_physical ELSE (d.qty_rak + d.qty_tray + d.qty_container) END)';
        $rows = $erp->table($p.'stocktake_det as d')
            ->join($p.'product as pr', 'pr.rowid', '=', 'd.fk_product')
            ->where('d.fk_stocktake', $data['fk_stocktake'])
            ->groupBy('pr.ref')
            ->get(['pr.ref as code', DB::raw('MAX(pr.label) as name'), DB::raw("SUM({$qtyExpr}) as qty")]);

        if ($data['truncate'] ?? true) {
            DB::table('stocktake_counts')->truncate();
        }

        $now = now()->toDateTimeString();
        $batch = [];
        foreach ($rows as $r) {
            if (blank($r->code)) {
                continue;
            }
            $batch[] = [
                'code' => $r->code,
                'name' => $r->name,
                'qty' => (float) $r->qty,
                'counted_at' => $session->stocktake_date,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }
        if (! $batch) {
            return back()->with('error', 'Sesi tidak punya baris item.');
        }
        $batch = $this->canonicalizeCodes($batch);
        foreach (array_chunk($batch, 500) as $chunk) {
            DB::table('stocktake_counts')->upsert($chunk, ['code'], ['name', 'qty', 'counted_at', 'updated_at']);
        }

        return back()->with('success', "Tarik stocktake '{$session->label}' selesai — ".count($batch).' item.');
    }

    /**
     * Excel/CSV sering menukar '/' pada kode item menjadi '_' (mis. TE_S50722-003 vs
     * TE/S50722-003 di ERP) → baris rekon pecah dua. Kode ber-'_' yang TIDAK dikenal
     * snapshot ERP/Accurate tapi versi '/'-nya dikenal dipetakan ke kode kanonik;
     * duplikat hasil pemetaan digabung (qty dijumlah). Kode '_' yang memang sah dibiarkan.
     *
     * @param  array<int, array<string, mixed>>  $batch
     * @return array<int, array<string, mixed>>
     */
    private function canonicalizeCodes(array $batch): array
    {
        $underscored = array_values(array_unique(array_filter(array_column($batch, 'code'), fn ($c) => str_contains((string) $c, '_'))));
        if (! $underscored) {
            return $batch;
        }

        $candidates = array_merge($underscored, array_map(fn ($c) => str_replace('_', '/', $c), $underscored));
        $known = array_flip(DB::table(InventorySnapshot::TABLE)->whereIn('ref', $candidates)->distinct()->pluck('ref')->all());

        $map = [];
        foreach ($underscored as $c) {
            $slash = str_replace('_', '/', $c);
            if (! isset($known[$c]) && isset($known[$slash])) {
                $map[$c] = $slash;
            }
        }
        if (! $map) {
            return $batch;
        }

        $out = [];
        foreach ($batch as $row) {
            $row['code'] = $map[$row['code']] ?? $row['code'];
            if (isset($out[$row['code']])) {
                $out[$row['code']]['qty'] += $row['qty'];
            } else {
                $out[$row['code']] = $row;
            }
        }

        return array_values($out);
    }

    /**
     * Import stocktake counts from an uploaded CSV file or pasted text. Accepts headered or
     * positional rows (code, name, qty[, principal]); upserts by code.
     */
    public function import(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'file' => ['nullable', 'file', 'mimes:csv,txt', 'max:5120'],
            'paste' => ['nullable', 'string'],
            'counted_at' => ['nullable', 'date'],
            'truncate' => ['nullable', 'boolean'],
        ]);

        $raw = '';
        if ($request->hasFile('file')) {
            $raw = (string) file_get_contents($request->file('file')->getRealPath());
        } elseif (filled($data['paste'] ?? null)) {
            $raw = (string) $data['paste'];
        } else {
            return back()->with('error', 'Tidak ada data — unggah file CSV atau tempel data dulu.');
        }

        $raw = preg_replace("/\r\n?/", "\n", $raw);
        $lines = array_values(array_filter(array_map('trim', explode("\n", $raw)), fn ($l) => $l !== ''));
        if (! $lines) {
            return back()->with('error', 'Data kosong.');
        }

        $delim = $this->detectDelimiter($lines[0]);
        $parse = fn (string $l) => array_map(fn ($c) => trim($c, " \t\"'"), str_getcsv($l, $delim));

        // Header detection + column mapping.
        $first = array_map('strtolower', $parse($lines[0]));
        $hasHeader = (bool) array_filter($first, fn ($c) => preg_match('/kode|code|qty|total|jumlah|nama|name/', $c));
        $idx = ['code' => 0, 'name' => 1, 'qty' => 2, 'principal' => null];
        if ($hasHeader) {
            $find = function (array $keys) use ($first) {
                foreach ($first as $i => $c) {
                    foreach ($keys as $k) {
                        if (str_contains($c, $k)) {
                            return $i;
                        }
                    }
                }

                return null;
            };
            $idx['code'] = $find(['kode', 'code']) ?? 0;
            $idx['name'] = $find(['nama', 'name', 'barang']);
            $idx['qty'] = $find(['total', 'qty', 'jumlah', 'fisik']) ?? 1;
            $idx['principal'] = $find(['principal', 'merek']);
        }

        $now = now()->toDateTimeString();
        $countedAt = filled($data['counted_at'] ?? null) ? Carbon::parse($data['counted_at'])->toDateString() : now()->toDateString();

        if ($data['truncate'] ?? false) {
            DB::table('stocktake_counts')->truncate();
        }

        $batch = [];
        $imported = 0;
        $skipped = 0;
        foreach (array_slice($lines, $hasHeader ? 1 : 0) as $line) {
            $cols = $parse($line);
            $code = trim((string) ($cols[$idx['code']] ?? ''));
            if ($code === '' || ! preg_match('/[A-Za-z0-9]/', $code)) {
                $skipped++;

                continue;
            }
            $qtyRaw = (string) ($cols[$idx['qty']] ?? '');
            $qty = (float) str_replace([' ', ','], ['', ''], preg_replace('/[^0-9,.\-]/', '', $qtyRaw) ?: '0');

            $batch[] = [
                'code' => $code,
                'name' => $idx['name'] !== null ? (($cols[$idx['name']] ?? null) ?: null) : null,
                'principal' => $idx['principal'] !== null ? (($cols[$idx['principal']] ?? null) ?: null) : null,
                'qty' => $qty,
                'counted_at' => $countedAt,
                'created_at' => $now,
                'updated_at' => $now,
            ];
            $imported++;
        }

        if (! $batch) {
            return back()->with('error', 'Tidak ada baris valid. Pastikan ada kolom Kode & Total/Qty.');
        }

        $batch = $this->canonicalizeCodes($batch);
        foreach (array_chunk($batch, 500) as $chunk) {
            DB::table('stocktake_counts')->upsert($chunk, ['code'], ['name', 'principal', 'qty', 'counted_at', 'updated_at']);
        }

        return back()->with('success', "Import stocktake selesai — {$imported} baris".($skipped ? ", {$skipped} dilewati" : '').'.');
    }

    /** Export the (filtered) 3-way reconciliation to .xls. */
    public function export(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $rows = $this->rowsQuery($request)->limit(20000)->get();

        $esc = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES);
        $num = fn ($v) => number_format((float) $v, 2, ',', '.');
        $hdr = 'background:#1f2937;color:#fff;font-weight:bold;text-align:center;';
        $html = '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Calibri,Arial;font-size:12px;">';
        $html .= '<tr style="'.$hdr.'"><th>No</th><th>Kode</th><th>Nama</th><th>Principal</th><th>ERP</th><th>Accurate</th><th>Fisik</th><th>ERP-Fisik</th><th>Acc-Fisik</th><th>Keterangan</th></tr>';
        $ket = function ($r) use ($num) {
            if (! $r->has_st) {
                return 'Belum ada hitung fisik';
            }
            $evs = (float) $r->erp_vs_st;
            $avs = (float) $r->acc_vs_st;
            $parts = [];
            if (! $r->has_erp) {
                $parts[] = 'ERP: tidak ada';
            } elseif ($evs != 0) {
                $parts[] = 'ERP '.($evs > 0 ? 'lebih' : 'kurang').' '.$num(abs($evs));
            }
            if (! $r->has_acc) {
                $parts[] = 'Accurate: tidak ada';
            } elseif ($avs != 0) {
                $parts[] = 'Accurate '.($avs > 0 ? 'lebih' : 'kurang').' '.$num(abs($avs));
            }

            return $parts ? implode(' · ', $parts) : 'Cocok';
        };
        foreach ($rows as $i => $r) {
            $html .= '<tr>'
                .'<td style="text-align:center;">'.($i + 1).'</td>'
                .'<td>'.$esc($r->code).'</td><td>'.$esc($r->name).'</td><td>'.$esc($r->principal).'</td>'
                .'<td style="text-align:right;">'.$num($r->erp_qty).'</td>'
                .'<td style="text-align:right;">'.$num($r->acc_qty).'</td>'
                .'<td style="text-align:right;">'.$num($r->st_qty).'</td>'
                .'<td style="text-align:right;">'.$num($r->erp_vs_st).'</td>'
                .'<td style="text-align:right;">'.$num($r->acc_vs_st).'</td>'
                .'<td>'.$esc($ket($r)).'</td>'
                .'</tr>';
        }
        $html .= '</table>';
        $doc = '<html><head><meta charset="UTF-8"></head><body><h3>Rekon System vs Stocktake</h3>'.$html.'</body></html>';

        return response($doc, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="rekon-system-vs-stocktake.xls"',
        ]);
    }

    private function detectDelimiter(string $line): string
    {
        $counts = [',' => substr_count($line, ','), ';' => substr_count($line, ';'), "\t" => substr_count($line, "\t"), '|' => substr_count($line, '|')];
        arsort($counts);

        return array_key_first($counts) ?: ',';
    }
}
