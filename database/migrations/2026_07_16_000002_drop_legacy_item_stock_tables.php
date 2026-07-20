<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pensiunkan erp_item_stock & acc_item_stock — digantikan sepenuhnya oleh
 * dwh_fact_inventory_snapshot (lihat 2026_07_16_000001).
 *
 * Keduanya hanya pernah menyimpan SATU tanggal (tiap sync menimpa), jadi tidak ada
 * riwayat yang hilang saat di-drop: sisi ERP bisa dibangun ulang kapan saja dengan
 * `php artisan dwh:backfill-stock`, sisi Accurate diisi ulang oleh sync harian.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('erp_item_stock');
        Schema::dropIfExists('acc_item_stock');
    }

    public function down(): void
    {
        // Bentuk ulang struktur lama (kosong) agar rollback tidak gagal. Isinya dipulihkan
        // dengan menjalankan ulang sync stok, bukan dari sini.
        Schema::create('erp_item_stock', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('erp_product_id')->nullable()->index();
            $table->string('ref')->nullable()->index();
            $table->string('label')->nullable();
            $table->string('principal')->nullable();
            $table->string('category_l2')->nullable();
            $table->decimal('buffer', 20, 2)->default(0);
            $table->decimal('qty', 20, 4)->default(0);
            $table->date('snapshot_date')->nullable()->index();
            $table->dateTime('synced_at')->nullable();
        });

        Schema::create('acc_item_stock', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('erp_id')->unique();
            $table->string('item_no')->nullable()->index();
            $table->string('name')->nullable();
            $table->string('item_type')->nullable()->index();
            $table->decimal('unit_price', 20, 2)->default(0);
            $table->decimal('quantity', 20, 4)->default(0);
            $table->decimal('available_to_sell', 20, 4)->default(0);
            $table->date('snapshot_date')->nullable()->index();
            $table->dateTime('synced_at')->nullable();
        });
    }
};
