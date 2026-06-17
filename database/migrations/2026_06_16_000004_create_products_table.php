<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->string('sku_code')->unique();
            $t->string('product_name');
            $t->string('principal_name')->nullable();
            $t->string('erp_ref')->nullable();        // link to ERP product (fetched later)

            // Master pricing criteria (merged from an approved change).
            $t->char('currency_code', 3)->nullable();
            $t->decimal('base_price_valas', 15, 2)->default(0);
            $t->decimal('principal_disc_pct', 6, 2)->default(0);
            $t->decimal('bm_nominal', 15, 2)->default(0);          // Bea Masuk
            $t->decimal('tax_nominal', 15, 2)->default(0);         // PPN/PPH
            $t->decimal('import_fee_nominal', 15, 2)->default(0);  // import shipment fees
            $t->decimal('opex_pct', 6, 2)->default(0);
            $t->decimal('profit_pct', 6, 2)->default(0);
            $t->decimal('comm_pct', 6, 2)->default(0);
            $t->decimal('ship_sales_pct', 6, 2)->default(0);
            $t->decimal('final_price', 15, 2)->default(0);         // last approved pricelist

            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
