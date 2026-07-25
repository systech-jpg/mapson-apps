<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Nomor PO per baris faktur pembelian Accurate (detailItem[].purchaseOrder.number).
 * Alur bisnis: PO lahir di Dolibarr → di-input ke Accurate dengan nomor yang sama,
 * jadi kolom ini = ref PO Dolibarr → pencocokan dokumen lintas sistem bisa eksak.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dwh_stg_acc_purchase_invoice_item', function (Blueprint $t) {
            $t->string('po_number', 64)->nullable()->after('doc_number')->index('idx_acc_pii_po_number');
        });
    }

    public function down(): void
    {
        Schema::table('dwh_stg_acc_purchase_invoice_item', function (Blueprint $t) {
            $t->dropColumn('po_number');
        });
    }
};
