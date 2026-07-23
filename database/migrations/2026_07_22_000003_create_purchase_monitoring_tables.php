<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fondasi Monitoring Pembelian.
 *
 * Pembelian ditarik dari Accurate ke dwh_stg_acc_purchase_invoice_item (sudah ada), tetapi:
 *  - kolom `total` mencampur mata uang (IDR untuk vendor lokal, USD untuk principal impor)
 *    tanpa penanda mata uang → tak bisa dijumlah;
 *  - kurs riil tak tersimpan di dokumen sumber (Accurate tak menangkapnya; Dolibarr mencatat
 *    kurs = 1,0 untuk semua faktur USD), jadi kurs historis harus disediakan terpisah.
 *
 * Tiga tabel:
 *  - dwh_fx_rate         : kurs → IDR per mata uang per bulan (isi manual / lookup eksternal).
 *  - dwh_map_vendor_principal : normalisasi vendor_name bebas → principal + mata uang default.
 *  - + kolom currency_code pada staging pembelian, agar tiap baris tahu mata uangnya.
 *
 * Konversi ke IDR sengaja DIHITUNG saat query (bukan disimpan) supaya perubahan kurs langsung
 * tercermin tanpa menyentuh ulang staging.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Kurs → IDR, satu baris per (mata uang, bulan). period = 'YYYY-MM'.
        Schema::create('dwh_fx_rate', function (Blueprint $t) {
            $t->id();
            $t->char('currency', 3);
            $t->char('period', 7);                 // YYYY-MM
            $t->decimal('rate_to_idr', 20, 6);
            $t->enum('source', ['manual', 'external', 'document'])->default('manual');
            $t->string('note')->nullable();
            $t->timestamps();

            $t->unique(['currency', 'period']);
        });

        // Normalisasi vendor bebas (dari Accurate) → principal + mata uang default.
        // Vendor tak berprincipal tetap dicatat (principal_id null) agar bisa dibucket "Lainnya".
        Schema::create('dwh_map_vendor_principal', function (Blueprint $t) {
            $t->id();
            $t->string('vendor_name')->unique();
            $t->foreignId('principal_id')->nullable()->constrained('pricing_principals')->nullOnDelete();
            $t->char('default_currency', 3)->default('IDR');
            $t->string('note')->nullable();
            $t->timestamps();
        });

        // Mata uang per baris pembelian. Diisi dari mapping vendor (sekarang) atau dari dokumen
        // Accurate saat sync berikutnya (lebih akurat).
        Schema::table('dwh_stg_acc_purchase_invoice_item', function (Blueprint $t) {
            $t->char('currency_code', 3)->nullable()->after('vendor_name');
        });
    }

    public function down(): void
    {
        Schema::table('dwh_stg_acc_purchase_invoice_item', function (Blueprint $t) {
            $t->dropColumn('currency_code');
        });
        Schema::dropIfExists('dwh_map_vendor_principal');
        Schema::dropIfExists('dwh_fx_rate');
    }
};
