<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Periodic snapshot fact: saldo stok per item PER TANGGAL, append-only.
 *
 * Menggantikan erp_item_stock + acc_item_stock yang hanya menyimpan SATU tanggal
 * (tiap sync menimpa, sehingga riwayat hilang tiap malam). Di sini satu baris per
 * (source, ref, snapshot_date) sehingga riwayat menumpuk dan Stock Aging /
 * Inventory Turnover / tren nilai persediaan menjadi mungkin.
 *
 * ERP (Dolibarr) dihitung genuinely as-of tanggal → bisa di-backfill mundur.
 * Accurate adalah saldo live saat ditarik → hanya bisa maju sejak hari ini.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dwh_fact_inventory_snapshot', function (Blueprint $table) {
            $table->id();

            $table->string('source', 16)->index();       // 'erp' | 'accurate'
            $table->date('snapshot_date')->index();
            $table->string('ref')->index();              // ERP ref = Accurate item_no (kunci pencocokan)
            $table->string('label')->nullable();
            $table->decimal('qty', 20, 4)->default(0);   // termasuk qty = 0 (item habis itu penting)

            // Khusus ERP (Dolibarr)
            $table->unsignedBigInteger('erp_product_id')->nullable();
            $table->string('principal')->nullable();
            $table->string('category_l2')->nullable();
            $table->decimal('buffer', 20, 2)->nullable(); // titik pesan ulang (seuil_stock_alerte)

            // Khusus Accurate
            $table->unsignedBigInteger('acc_item_id')->nullable();
            $table->string('item_type')->nullable();      // INVENTORY | SERVICE | GROUP | ...
            $table->decimal('unit_price', 20, 2)->nullable(); // harga JUAL (bukan HPP)
            $table->decimal('available_to_sell', 20, 4)->nullable();

            $table->dateTime('synced_at')->nullable();

            // Re-run untuk tanggal yang sama = isi ulang tanggal itu saja, bukan hapus semua.
            $table->unique(['source', 'ref', 'snapshot_date'], 'dwh_inv_snap_uq');
            $table->index(['source', 'snapshot_date'], 'dwh_inv_snap_src_date_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dwh_fact_inventory_snapshot');
    }
};
