<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pecah satu baris GL menjadi beberapa sub-transaksi.
 *
 * Kebutuhannya nyata: memo voucher disalin ke semua baris GL, dan satu baris kerap memuat
 * beberapa transaksi berbeda departemen — mis. "Transport F014 Rp 126.677 / F012 Rp 30.000 /
 * F016 Rp 25.000 / F011 Rp 33.300" yang jumlahnya persis sama dengan debit baris tsb.
 * Override per baris (1 baris = 1 kategori) tak sanggup mewakili itu.
 *
 * Baris dikunci lewat HASH ISI (sama seperti dwh_map_gl_classification.scope='row') agar
 * bertahan saat GL diimpor ulang. Total split WAJIB sama dengan nilai baris — divalidasi di
 * controller, sehingga laporan tetap tie-back ke GL.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dwh_gl_row_split', function (Blueprint $t) {
            $t->id();
            $t->char('row_hash', 32)->index();          // MD5 isi baris GL
            $t->string('label');                        // teks sub-item dari memo
            $t->decimal('amount', 20, 4);
            $t->foreignId('category_id')->nullable()->constrained('dwh_dim_gl_category')->nullOnDelete();
            $t->unsignedSmallInteger('sort_order')->default(0);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dwh_gl_row_split');
    }
};
