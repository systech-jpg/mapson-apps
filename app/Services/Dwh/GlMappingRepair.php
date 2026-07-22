<?php

namespace App\Services\Dwh;

use Illuminate\Support\Facades\DB;

/**
 * Deteksi & pemulihan mapping klasifikasi GL yang terputus akibat impor ulang.
 *
 * Impor GL menimpa satu periode penuh (hapus+tulis ulang), jadi mapping tidak boleh bergantung
 * pada id baris — dipakailah hash isi baris. Hash itu selamat selama isinya identik, tapi putus
 * begitu salah satu field yang di-hash berubah (keterangan, nominal, no bukti, kode akun).
 *
 * Karena hash satu arah, pemulihan bersandar pada KUNCI ALAMI yang disimpan terpisah
 * (rk_account_code + rk_doc_no + rk_debit + rk_credit). Keterangan sengaja tidak ikut, sebab
 * edit teks justru penyebab putus tersering — mengabaikannya membuat mapping bisa disambungkan
 * kembali walau keterangannya diperbaiki.
 */
class GlMappingRepair
{
    /** Harus sama persis dengan GlClassificationController::ROW_HASH. */
    protected const ROW_HASH = "MD5(CONCAT_WS('|', g.account_code, COALESCE(g.doc_no,''), COALESCE(g.description,''), CAST(g.debit AS CHAR), CAST(g.credit AS CHAR)))";

    /** Jumlah mapping yang kehilangan baris GL-nya. */
    public function status(): array
    {
        $this->materialiseLiveHashes();

        $rows = (int) DB::table('dwh_map_gl_classification')->where('scope', 'row')
            ->whereRaw('match_key NOT IN (SELECT h FROM tmp_gl_hash)')->count();

        $splits = (int) DB::table('dwh_gl_row_split')
            ->whereRaw('row_hash NOT IN (SELECT h FROM tmp_gl_hash)')
            ->distinct()->count(DB::raw('row_hash'));

        return [
            'row_orphans' => $rows,
            'split_orphans' => $splits,
            'total' => $rows + $splits,
        ];
    }

    /**
     * Sambungkan ulang mapping yatim ke baris GL yang cocok kunci alaminya.
     *
     * Hanya disambung bila kandidatnya TUNGGAL — bila satu kunci alami menunjuk beberapa baris
     * (atau tak ada sama sekali), keputusan diserahkan ke manusia agar tidak salah tempel.
     *
     * @return array{relinked: int, ambiguous: int, unresolved: int}
     */
    public function relink(): array
    {
        $this->materialiseLiveHashes();

        $stats = ['relinked' => 0, 'ambiguous' => 0, 'unresolved' => 0];

        foreach ([
            ['dwh_map_gl_classification', 'match_key', "AND m.scope = 'row'"],
            ['dwh_gl_row_split', 'row_hash', ''],
        ] as [$table, $keyColumn, $extra]) {
            $candidates = DB::select("
                SELECT m.{$keyColumn} old_key,
                       COUNT(DISTINCT ".self::ROW_HASH.") n_cand,
                       MIN(".self::ROW_HASH.") new_key
                FROM {$table} m
                JOIN dwh_stg_gl g
                  ON g.account_code = m.rk_account_code
                 AND COALESCE(g.doc_no,'') = m.rk_doc_no
                 AND g.debit  = m.rk_debit
                 AND g.credit = m.rk_credit
                WHERE m.rk_account_code IS NOT NULL {$extra}
                  AND m.{$keyColumn} NOT IN (SELECT h FROM tmp_gl_hash)
                GROUP BY m.{$keyColumn}
            ");

            foreach ($candidates as $c) {
                if ((int) $c->n_cand > 1) {
                    $stats['ambiguous']++;

                    continue;
                }

                // Jangan tabrak mapping lain yang sudah memakai hash tujuan.
                $taken = DB::table($table)->where($keyColumn, $c->new_key)
                    ->when($table === 'dwh_map_gl_classification', fn ($q) => $q->where('scope', 'row'))
                    ->exists();

                if ($taken) {
                    $stats['ambiguous']++;

                    continue;
                }

                DB::table($table)->where($keyColumn, $c->old_key)
                    ->when($table === 'dwh_map_gl_classification', fn ($q) => $q->where('scope', 'row'))
                    ->update([$keyColumn => $c->new_key, 'updated_at' => now()]);

                $stats['relinked']++;
            }
        }

        $stats['unresolved'] = $this->status()['total'];

        return $stats;
    }

    /** Daftar hash baris GL yang hidup — ditaruh di tabel sementara agar pencocokan tidak lambat. */
    protected function materialiseLiveHashes(): void
    {
        DB::statement('DROP TEMPORARY TABLE IF EXISTS tmp_gl_hash');
        DB::statement('CREATE TEMPORARY TABLE tmp_gl_hash (h CHAR(32) PRIMARY KEY)');
        DB::statement('INSERT IGNORE INTO tmp_gl_hash (h) SELECT '.self::ROW_HASH.' FROM dwh_stg_gl g');
    }
}
