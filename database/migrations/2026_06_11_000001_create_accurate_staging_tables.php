<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('acc_sales_invoices', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('erp_id')->unique();
            $table->string('number')->nullable()->index();
            $table->date('trans_date')->nullable()->index();
            $table->date('ship_date')->nullable();
            $table->date('due_date')->nullable();
            $table->string('po_number')->nullable()->index();
            $table->string('description')->nullable();      // keterangan (mis. nama pasien)
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('customer_name')->nullable();
            $table->string('status_name')->nullable();
            $table->decimal('dpp', 20, 2)->default(0);
            $table->decimal('ppn', 20, 2)->default(0);
            $table->decimal('total', 20, 2)->default(0);
            $table->dateTime('synced_at')->nullable();
        });

        Schema::create('acc_sales_invoice_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('erp_id')->unique();          // detailItem id
            $table->unsignedBigInteger('erp_invoice_id')->index();
            $table->string('invoice_number')->nullable()->index();
            $table->integer('seq')->nullable();
            $table->string('item_no')->nullable();
            $table->string('item_name')->nullable();
            $table->decimal('qty', 20, 4)->default(0);
            $table->string('unit')->nullable();
            $table->decimal('unit_price', 20, 2)->default(0);
            $table->decimal('gross', 20, 2)->default(0);
            $table->decimal('disc_percent', 8, 2)->default(0);
            $table->decimal('disc_amount', 20, 2)->default(0);
            $table->decimal('dpp', 20, 2)->default(0);
            $table->decimal('ppn', 20, 2)->default(0);
            $table->string('tax_name')->nullable();
            $table->decimal('total', 20, 2)->default(0);
            $table->unsignedBigInteger('so_id')->nullable();
            $table->string('so_number')->nullable()->index();
            $table->unsignedBigInteger('do_id')->nullable();
            $table->string('do_number')->nullable()->index();
            $table->dateTime('synced_at')->nullable();
        });

        Schema::create('acc_sales_orders', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('erp_id')->unique();
            $table->string('number')->nullable()->index();
            $table->date('trans_date')->nullable();
            $table->string('po_number')->nullable()->index();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('customer_name')->nullable();
            $table->decimal('total', 20, 2)->default(0);
            $table->string('status_name')->nullable();
            $table->dateTime('synced_at')->nullable();
        });

        Schema::create('acc_delivery_orders', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('erp_id')->unique();
            $table->string('number')->nullable()->index();
            $table->date('trans_date')->nullable();
            $table->string('po_number')->nullable()->index();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('customer_name')->nullable();
            $table->dateTime('synced_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('acc_sales_invoice_items');
        Schema::dropIfExists('acc_sales_invoices');
        Schema::dropIfExists('acc_sales_orders');
        Schema::dropIfExists('acc_delivery_orders');
    }
};
