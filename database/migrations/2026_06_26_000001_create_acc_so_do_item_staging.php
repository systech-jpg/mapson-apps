<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // SO line items (actual ordered goods) — pulled per period from sales-order/detail.do.
        Schema::create('acc_sales_order_items', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('erp_id')->unique();         // detailItem id
            $t->unsignedBigInteger('erp_so_id')->index();
            $t->string('so_number')->nullable()->index();
            $t->date('trans_date')->nullable()->index();        // SO date (denormalized for filtering)
            $t->integer('seq')->nullable();
            $t->string('item_no')->nullable();
            $t->string('item_name')->nullable();
            $t->decimal('qty', 20, 4)->default(0);
            $t->string('unit')->nullable();
            $t->decimal('unit_price', 20, 2)->default(0);
            $t->decimal('total', 20, 2)->default(0);
            $t->dateTime('synced_at')->nullable();
        });

        // DO line items (actual shipped goods) — pulled per period from delivery-order/detail.do.
        Schema::create('acc_delivery_order_items', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('erp_id')->unique();         // detailItem id
            $t->unsignedBigInteger('erp_do_id')->index();
            $t->string('do_number')->nullable()->index();
            $t->date('trans_date')->nullable()->index();        // DO date (denormalized for filtering)
            $t->integer('seq')->nullable();
            $t->string('item_no')->nullable();
            $t->string('item_name')->nullable();
            $t->decimal('qty', 20, 4)->default(0);
            $t->string('unit')->nullable();
            $t->string('so_number')->nullable()->index();       // SO this shipment line fulfils
            $t->dateTime('synced_at')->nullable();
        });

        // Denormalize the invoice date onto invoice items so the period filter is uniform.
        Schema::table('acc_sales_invoice_items', function (Blueprint $t) {
            $t->date('trans_date')->nullable()->after('invoice_number')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('acc_sales_order_items');
        Schema::dropIfExists('acc_delivery_order_items');
        Schema::table('acc_sales_invoice_items', fn (Blueprint $t) => $t->dropColumn('trans_date'));
    }
};
