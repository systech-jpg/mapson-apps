<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Staging pesanan pembelian (purchase-order) Accurate — nomornya = ref PO Dolibarr
 * (alur: PO lahir di Dolibarr → di-input ke Accurate), jadi jembatan eksak lintas sistem.
 * Nilai tambah: mata uang ASLI per dokumen + KURS RIIL (`rate`) yang selama ini tak
 * tersedia di sumber mana pun, serta status proses (Menunggu/Sebagian/Terproses).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dwh_stg_acc_purchase_order', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('erp_id')->unique('uq_acc_po_erp_id');
            $t->string('number', 64)->nullable()->index('idx_acc_po_number'); // = ref PO Dolibarr
            $t->date('trans_date')->nullable()->index('idx_acc_po_date');
            $t->string('vendor_name')->nullable()->index('idx_acc_po_vendor');
            $t->string('status_name', 64)->nullable();   // Menunggu/Sebagian/Terproses (label UI Accurate)
            $t->string('status_code', 32)->nullable();
            $t->decimal('percent_shipped', 5, 1)->nullable();
            $t->char('currency_code', 3)->nullable();    // mata uang ASLI dokumen
            $t->decimal('rate', 18, 6)->nullable();      // kurs riil saat input
            $t->decimal('total_amount', 18, 2)->default(0); // nilai asli (net) dlm mata uang dokumen
            $t->timestamp('synced_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dwh_stg_acc_purchase_order');
    }
};
