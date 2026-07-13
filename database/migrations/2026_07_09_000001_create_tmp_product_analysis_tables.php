<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TRIAL (prefix tmp_): product-level P&L analysis for selected principal products
 * (Colarose / Boneguard — Phytocemindo). Reads existing acc_* staging tables for
 * sales & stock; these tables only add what is missing: item→product mapping,
 * purchase prices (COGS basis), and manually entered "biaya lain-lain".
 * Safe to drop entirely once the trial is promoted to a permanent design.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Which Accurate items belong to which analysis product/principal.
        Schema::create('tmp_product_map', function (Blueprint $t) {
            $t->id();
            $t->string('item_no')->unique();
            $t->string('item_name')->nullable();
            $t->string('product_label')->index();   // Colarose, Boneguard, …
            $t->string('principal')->nullable();    // Phytocemindo
            $t->string('source', 16)->default('auto'); // auto (keyword match) | manual
            $t->timestamps();
        });

        // Purchase invoice lines for mapped items → weighted avg cost + price trend.
        Schema::create('tmp_product_purchases', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('erp_id')->unique(); // PI detail line id
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

        // Manual "biaya lain-lain" entries (entertain, konsultan, perizinan, …).
        Schema::create('tmp_product_expenses', function (Blueprint $t) {
            $t->id();
            $t->date('expense_date')->index();
            $t->string('product_label')->nullable()->index(); // null = Umum (tidak spesifik produk)
            $t->string('category');                           // Entertain, Konsultan, Perizinan, …
            $t->string('description')->nullable();
            $t->decimal('amount', 20, 2)->default(0);
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tmp_product_expenses');
        Schema::dropIfExists('tmp_product_purchases');
        Schema::dropIfExists('tmp_product_map');
    }
};
