<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales_facts', function (Blueprint $table) {
            $table->id();

            // Identitas & tanggal
            $table->string('tahun', 4)->nullable();
            $table->string('bill_to')->nullable();
            $table->string('customer')->nullable();
            $table->date('purchase_date')->nullable();
            $table->string('purchase_number')->nullable();
            $table->date('do_date')->nullable();
            $table->string('do_no')->nullable();
            $table->string('no_gr')->nullable();
            $table->string('usage_report')->nullable();
            $table->string('bast_spk')->nullable();
            $table->string('patient')->nullable();

            // Invoice
            $table->date('invoice_date')->nullable();
            $table->string('invoice_no')->nullable()->index();
            $table->text('remarks')->nullable();
            $table->string('nomor_faktur')->nullable();
            $table->string('reff')->nullable();

            // Produk
            $table->string('part_number')->nullable()->index();
            $table->text('description')->nullable();
            $table->decimal('quantity', 18, 2)->nullable();
            $table->string('category_1')->nullable();
            $table->string('category_2')->nullable();
            $table->string('category_3')->nullable();
            $table->string('category_4')->nullable();
            $table->string('merk')->nullable();

            // Harga
            $table->decimal('price_qty', 18, 2)->default(0);
            $table->decimal('total_price', 18, 2)->default(0);
            $table->decimal('disc', 7, 2)->default(0);
            $table->decimal('disc_value', 18, 2)->default(0);
            $table->decimal('dpp', 18, 2)->default(0);
            $table->decimal('ppn', 18, 2)->default(0);
            $table->decimal('down_payment', 18, 2)->default(0);
            $table->decimal('total', 18, 2)->default(0);

            // Sales & tim
            $table->string('team')->nullable();
            $table->string('doctor')->nullable();
            $table->string('sales')->nullable()->index();
            $table->string('sales_2')->nullable();

            // Pembayaran
            $table->string('paid_unpaid')->nullable();
            $table->string('tgl_tukar_faktur')->nullable();
            $table->string('tempo')->nullable();
            $table->date('due_date')->nullable();
            $table->date('payment_date')->nullable();
            $table->string('region')->nullable();
            $table->string('technical_support')->nullable();

            // Referensi ke ERP + waktu data ditarik
            $table->unsignedBigInteger('erp_invoice_id')->nullable()->index();
            $table->timestamp('synced_at')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_facts');
    }
};
