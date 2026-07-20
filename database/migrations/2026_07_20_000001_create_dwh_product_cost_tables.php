<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Basis HPP (harga pokok) per produk untuk ABC costing / P&L per produk.
 *
 * Menggeneralisasi tmp_product_purchases (trial, hanya item terpilih) menjadi
 * staging faktur pembelian SELURUH item, lalu menurunkan biaya pokok per item.
 *
 * KENAPA dari faktur pembelian: endpoint jurnal/expense Accurate diblokir hak akses,
 * tetapi purchase-invoice/list.do TIDAK — jadi harga beli bisa ditarik otomatis.
 * acc_item_stock.unit_price / snapshot.unit_price = harga JUAL, bukan HPP → tak bisa dipakai.
 *
 * dwh_map_product_cost = turunan (weighted-average) yang dipakai join oleh engine
 * costing. Dipisah dari staging supaya bisa dihitung ulang tanpa menarik ulang API.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Staging baris faktur pembelian — SEMUA item. Idempoten upsert by erp_id.
        Schema::create('dwh_stg_acc_purchase_invoice_item', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('erp_id')->unique();   // id baris detail PI
            $t->unsignedBigInteger('erp_doc_id')->nullable();
            $t->string('doc_number')->nullable();
            $t->date('trans_date')->nullable()->index();
            $t->string('vendor_name')->nullable();
            $t->string('item_no')->nullable()->index();
            $t->string('item_name')->nullable();
            $t->decimal('qty', 18, 4)->default(0);
            $t->string('unit')->nullable();
            $t->decimal('unit_price', 20, 2)->default(0);
            $t->decimal('total', 20, 2)->default(0);
            $t->dateTime('synced_at')->nullable();
        });

        // HPP per item = rata-rata tertimbang dari baris pembelian di atas.
        Schema::create('dwh_map_product_cost', function (Blueprint $t) {
            $t->id();
            $t->string('item_no')->unique();              // = snapshot.ref = sales_facts item
            $t->string('item_name')->nullable();
            $t->decimal('avg_cost', 20, 2)->default(0);   // SUM(total) / SUM(qty) — biaya pokok pakai
            $t->decimal('last_cost', 20, 2)->default(0);  // unit_price pembelian terakhir
            $t->date('last_date')->nullable();            // tanggal pembelian terakhir
            $t->decimal('qty_total', 18, 4)->default(0);  // total qty terbeli di jendela
            $t->unsignedInteger('doc_count')->default(0); // jumlah baris pembelian
            $t->date('window_from')->nullable();          // jendela sumber (untuk jejak)
            $t->date('window_to')->nullable();
            $t->dateTime('computed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dwh_map_product_cost');
        Schema::dropIfExists('dwh_stg_acc_purchase_invoice_item');
    }
};
