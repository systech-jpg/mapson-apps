<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * COA Accurate + pemetaannya.
 *
 * dwh_stg_acc_glaccount = tarikan mentah dari glaccount/list.do (endpoint ini TIDAK
 * diblokir, beda dari jurnal). Memberi accountType + parentName, sehingga struktur
 * P&L (Pendapatan / HPP / Beban / Non-Operasional) didapat tanpa pemetaan manual.
 *
 * dwh_map_coa = lapisan yang diisi manusia: kategori biaya & cost center — hal yang
 * tidak diketahui Accurate. Dipisah dari staging supaya tarikan ulang COA tidak
 * menghapus pekerjaan pemetaan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dwh_stg_acc_glaccount', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('acc_id')->unique();   // id Accurate
            $table->string('no')->index();                    // nomor akun = dwh_stg_gl.account_code
            $table->string('name')->nullable();
            $table->string('account_type')->nullable()->index(); // REVENUE|COGS|EXPENSE|OTHER_EXPENSE|OTHER_INCOME|CASH_BANK|...
            $table->string('parent_name')->nullable();        // untuk hirarki pohon COA
            $table->decimal('balance', 20, 2)->default(0);    // saldo BERJALAN (tak bisa difilter tanggal)
            $table->dateTime('synced_at')->nullable();
        });

        Schema::create('dwh_map_coa', function (Blueprint $table) {
            $table->id();
            $table->string('account_code')->unique();  // = dwh_stg_gl.account_code (JANGAN pakai nama: nama bisa duplikat antar kode)
            $table->string('category')->nullable()->index(); // kategori biaya versi manajemen
            $table->string('cost_center')->nullable()->index();
            $table->text('note')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dwh_map_coa');
        Schema::dropIfExists('dwh_stg_acc_glaccount');
    }
};
