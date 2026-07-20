<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Staging Histori Buku Besar (GL) hasil upload Excel dari Accurate.
 *
 * Jalur upload dipakai karena endpoint jurnal Accurate (journal-voucher / expense /
 * other-payment) diblokir hak akses dan tidak akan dibuka. Laporan "Histori Buku Besar"
 * memberi data yang setara: Kode #, Nama Perkiraan, Debit, Kredit, No Bukti, Keterangan.
 *
 * IDEMPOTEN PER PERIODE: impor ulang sebuah bulan menghapus dulu baris bulan itu, lalu
 * menulis ulang. Ini WAJIB — terbukti buku Januari masih berubah setelah ditutup
 * (mis. 2 pembayaran "Renovasi" 106,8 jt muncul belakangan, dan ada reklasifikasi
 * Salary → Commision). Baris GL tidak punya id stabil, jadi kunci idempotensinya = periode.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dwh_stg_gl', function (Blueprint $table) {
            $table->id();

            $table->string('period', 7)->index();        // YYYY-MM, dari judul laporan
            $table->date('period_start')->nullable();
            $table->date('period_end')->nullable();
            $table->string('branch')->nullable();         // "Cabang : ..." dari header

            $table->string('trx_type')->nullable();       // Tipe Transaksi Jurnal
            $table->string('doc_no')->nullable()->index(); // No Bukti #
            $table->string('account_code')->index();      // Kode # — WAJIB, kunci pencocokan
            $table->string('account_name')->nullable();   // Nama Perkiraan (nama BISA duplikat antar kode)
            $table->text('description')->nullable();      // Keterangan Jurnal (boleh multi-baris)

            $table->decimal('debit', 20, 4)->default(0);
            $table->decimal('credit', 20, 4)->default(0);
            $table->decimal('amount', 20, 4)->default(0); // debit - credit (net), agar query ringkas

            $table->unsignedInteger('row_no')->nullable(); // baris asal di file, untuk telusur
            $table->string('source_file')->nullable();
            $table->foreignId('imported_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('imported_at')->nullable();

            $table->index(['period', 'account_code'], 'dwh_stg_gl_period_acc_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dwh_stg_gl');
    }
};
