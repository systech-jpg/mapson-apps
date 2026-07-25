<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Staging pembayaran pembelian Accurate (purchase-payment) — satu baris per pasangan
 * (payment, faktur yang dibayarnya). Dipakai halaman rekonsiliasi untuk tahu tanggal
 * bayar & bank riil saat membuat payment di Dolibarr; nomor bank Accurate (1120001, …)
 * sama dengan ref bank_account Dolibarr sehingga rekening bisa dipetakan otomatis.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dwh_stg_acc_purchase_payment', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('erp_payment_id');            // id purchase-payment Accurate
            $t->unsignedBigInteger('erp_invoice_id')->nullable(); // id faktur yang dibayar (baris detailInvoice)
            $t->string('number')->nullable();                    // nomor payment, ex 1120001.2026.07.00057
            $t->date('trans_date')->nullable();                  // tanggal bayar
            $t->string('vendor_name')->nullable()->index();
            $t->string('bank_no', 32)->nullable();               // = ref bank_account Dolibarr
            $t->string('bank_name')->nullable();
            $t->string('payment_method', 32)->nullable();        // BANK_TRANSFER | CASH | CHEQUE | ...
            $t->string('invoice_number')->nullable();            // nomor internal faktur Accurate
            $t->string('bill_number')->nullable();               // nomor tagihan vendor
            $t->decimal('payment_amount', 18, 2)->default(0);
            $t->timestamp('synced_at')->nullable();
            $t->unique(['erp_payment_id', 'erp_invoice_id'], 'uq_acc_purchase_payment');
            $t->index('trans_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dwh_stg_acc_purchase_payment');
    }
};
