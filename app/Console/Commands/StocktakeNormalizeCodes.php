<?php

namespace App\Console\Commands;

use App\Support\InventorySnapshot;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Perbaiki kode item stocktake yang '_' padahal kanoniknya '/' (mis. TE_S50722-003 →
 * TE/S50722-003) — efek Excel/CSV menukar '/' jadi '_' saat import, membuat baris
 * Rekon vs Stocktake pecah dua. Hanya kode '_' yang TIDAK dikenal snapshot tapi versi
 * '/'-nya dikenal yang diubah; kalau kode kanonik sudah ada di stocktake_counts,
 * qty digabung ke sana dan baris '_' dihapus.
 */
class StocktakeNormalizeCodes extends Command
{
    protected $signature = 'stocktake:normalize-codes {--dry : Tampilkan rencana tanpa mengubah data}';

    protected $description = 'Normalisasi kode stocktake_counts ber-underscore ke kode kanonik ber-/ (dari snapshot ERP/Accurate)';

    public function handle(): int
    {
        $rows = DB::table('stocktake_counts')->where('code', 'like', '%\_%')->get(['id', 'code', 'qty']);
        if ($rows->isEmpty()) {
            $this->info('Tidak ada kode ber-underscore — tidak ada yang perlu dinormalisasi.');

            return self::SUCCESS;
        }

        $candidates = $rows->pluck('code')
            ->merge($rows->map(fn ($r) => str_replace('_', '/', $r->code)))
            ->unique()->values()->all();
        $known = array_flip(DB::table(InventorySnapshot::TABLE)->whereIn('ref', $candidates)->distinct()->pluck('ref')->all());

        $renamed = 0;
        $merged = 0;
        $left = 0;
        foreach ($rows as $r) {
            $slash = str_replace('_', '/', $r->code);
            if (isset($known[$r->code]) || ! isset($known[$slash])) {
                $left++; // kode '_' memang sah, atau versi '/' pun tak dikenal — jangan tebak

                continue;
            }

            $existing = DB::table('stocktake_counts')->where('code', $slash)->first(['id', 'qty']);
            if ($existing) {
                $this->line(($this->option('dry') ? '[DRY] ' : '')."{$r->code} → gabung ke {$slash} (qty {$r->qty} + {$existing->qty})");
                if (! $this->option('dry')) {
                    DB::table('stocktake_counts')->where('id', $existing->id)
                        ->update(['qty' => (float) $existing->qty + (float) $r->qty, 'updated_at' => now()]);
                    DB::table('stocktake_counts')->where('id', $r->id)->delete();
                }
                $merged++;
            } else {
                $this->line(($this->option('dry') ? '[DRY] ' : '')."{$r->code} → {$slash}");
                if (! $this->option('dry')) {
                    DB::table('stocktake_counts')->where('id', $r->id)->update(['code' => $slash, 'updated_at' => now()]);
                }
                $renamed++;
            }
        }

        $this->info(($this->option('dry') ? '[DRY] ' : '')."Selesai: {$renamed} kode diganti, {$merged} digabung, {$left} dibiarkan (sah / tak dikenal).");

        return self::SUCCESS;
    }
}
