<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Kunci pemulihan untuk mapping klasifikasi GL.
 *
 * MASALAH: mapping baris dikunci lewat HASH ISI baris — tahan terhadap impor ulang (id baris
 * selalu berubah karena impor menghapus+menulis ulang seluruh periode), TAPI putus diam-diam
 * begitu isi barisnya berubah. Terbukti empiris: impor ulang file identik → 202 mapping selamat;
 * satu keterangan diubah → jadi 201. Dan perubahan itu MEMANG diharapkan terjadi, karena impor
 * ulang justru ada untuk mengakomodasi buku tutup yang masih berubah.
 *
 * Hash bersifat SATU ARAH, jadi dari match_key yang yatim kita tak bisa tahu baris aslinya apa.
 * Karena itu kunci alaminya disimpan terpisah: kode akun + no bukti + debit + kredit. Keterangan
 * SENGAJA tidak ikut — justru edit teks itulah penyebab putus tersering.
 *
 * Backfill dijalankan di sini selagi seluruh mapping masih nyambung; bila ditunda sampai ada yang
 * yatim, kunci untuk baris tersebut hilang permanen.
 */
return new class extends Migration
{
    /** Ekspresi hash isi baris — harus sama persis dengan GlClassificationController::ROW_HASH. */
    protected const ROW_HASH = "MD5(CONCAT_WS('|', g.account_code, COALESCE(g.doc_no,''), COALESCE(g.description,''), CAST(g.debit AS CHAR), CAST(g.credit AS CHAR)))";

    public function up(): void
    {
        foreach (['dwh_map_gl_classification', 'dwh_gl_row_split'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->string('rk_account_code')->nullable()->index();
                $t->string('rk_doc_no')->nullable();
                $t->decimal('rk_debit', 20, 4)->nullable();
                $t->decimal('rk_credit', 20, 4)->nullable();
            });
        }

        $this->backfill('dwh_map_gl_classification', 'match_key', "scope = 'row'");
        $this->backfill('dwh_gl_row_split', 'row_hash');
    }

    /** Salin kunci alami dari baris GL yang saat ini masih cocok dengan hash. */
    protected function backfill(string $table, string $keyColumn, ?string $extraWhere = null): void
    {
        $where = $extraWhere ? "AND m.{$extraWhere}" : '';

        DB::statement("
            UPDATE {$table} m
            JOIN (
                SELECT ".self::ROW_HASH." h,
                       MIN(g.account_code) account_code,
                       MIN(COALESCE(g.doc_no,'')) doc_no,
                       MIN(g.debit) debit,
                       MIN(g.credit) credit
                FROM dwh_stg_gl g
                GROUP BY h
            ) x ON x.h = m.{$keyColumn}
            SET m.rk_account_code = x.account_code,
                m.rk_doc_no       = x.doc_no,
                m.rk_debit        = x.debit,
                m.rk_credit       = x.credit
            WHERE m.rk_account_code IS NULL {$where}
        ");
    }

    public function down(): void
    {
        foreach (['dwh_map_gl_classification', 'dwh_gl_row_split'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropColumn(['rk_account_code', 'rk_doc_no', 'rk_debit', 'rk_credit']);
            });
        }
    }
};
