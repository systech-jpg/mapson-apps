<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Modul Regulatory — daftar izin edar (AKL/AKD). Header = satu nomor izin edar
 * (nama produk terdaftar, produsen, kelas resiko, masa berlaku); detail = kode-kode
 * produk yang tercakup di izin itu (lampiran AKL).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('regulatory_registrations', function (Blueprint $t) {
            $t->id();
            $t->string('akl_number', 40)->unique();          // "AKL 21302220256"
            $t->string('product_name');                      // nama produk sesuai izin
            $t->string('manufacturer')->nullable();          // produsen/principle
            $t->string('risk_class', 60)->nullable();        // "Non Elektromedik Non Steril / C"
            $t->string('category', 120)->nullable();         // kategori produk
            $t->string('sub_category', 120)->nullable();
            $t->string('product_type', 160)->nullable();     // jenis produk
            $t->string('application_type', 60)->nullable();  // Permohonan Baru / Perubahan / Perpanjangan ...
            $t->date('issued_date')->nullable();
            $t->date('expired_date')->nullable();
            $t->string('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->softDeletes();

            $t->index('expired_date');
        });

        Schema::create('regulatory_registration_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('registration_id')->constrained('regulatory_registrations')->cascadeOnDelete();
            $t->string('item_code', 100)->nullable();
            $t->string('description')->nullable();
            $t->unsignedSmallInteger('sort_order')->default(0);
            $t->timestamps();

            $t->index('item_code');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('regulatory_registration_items');
        Schema::dropIfExists('regulatory_registrations');
    }
};
