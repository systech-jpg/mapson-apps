<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-item, per-document stock movement ledger reconstructed from Accurate transaction
 * documents (delivery-order, receive-item, returns, item-adjustment, direct sales/purchase
 * invoices). This is the per-item-correct source — unlike item/stock-mutation-history.do
 * which returns a global, current-period-only feed that ignores the item filter.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('acc_stock_movements', function (Blueprint $table) {
            $table->id();
            $table->string('doc_type', 24);          // DO, RI, SR, PR, IA, SI, PI
            $table->string('doc_number')->nullable();
            $table->date('trans_date')->nullable();
            $table->string('item_no')->nullable()->index();
            $table->unsignedBigInteger('item_id')->nullable();
            $table->string('item_name')->nullable();
            $table->string('warehouse')->nullable();
            $table->decimal('qty', 18, 4)->default(0); // signed: + masuk, - keluar
            $table->unsignedBigInteger('erp_doc_id')->nullable();
            $table->unsignedBigInteger('line_id')->nullable(); // detail line id (dedup key)
            $table->timestamp('synced_at')->nullable();

            $table->unique(['doc_type', 'line_id'], 'acc_smv_type_line_uq');
            $table->index(['item_no', 'trans_date']);
            $table->index('trans_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('acc_stock_movements');
    }
};
