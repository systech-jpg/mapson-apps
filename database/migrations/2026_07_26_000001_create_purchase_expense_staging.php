<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Staging baris BIAYA (detailExpense) faktur pembelian Accurate — freight impor, custom
 * clearance/PIB, storage, dll. Bahan analisa biaya impor di dashboard Purchasing:
 * rate biaya impor vs nilai barang + komposisinya. `amount` dalam mata uang dokumen
 * (konvensi sama dengan staging item; konversi IDR via mapping vendor + dwh_fx_rate).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dwh_stg_acc_purchase_expense', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('erp_id')->unique('uq_acc_pexp_erp_id'); // id baris expense Accurate
            $t->unsignedBigInteger('erp_doc_id')->nullable()->index('idx_acc_pexp_doc');
            $t->string('doc_number')->nullable();
            $t->date('trans_date')->nullable()->index('idx_acc_pexp_date');
            $t->string('vendor_name')->nullable()->index('idx_acc_pexp_vendor');
            $t->string('account_no', 32)->nullable();     // 5400000 Shipping Import, 5500000 Custom Clearance, ...
            $t->string('account_name')->nullable();
            $t->text('notes')->nullable();                // sering memuat AWB/PIB/ref PO
            $t->decimal('amount', 18, 2)->default(0);     // dlm mata uang dokumen
            $t->timestamp('synced_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dwh_stg_acc_purchase_expense');
    }
};
