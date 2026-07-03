<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Product master identity + cost-side inputs (intrinsic to the product, profile-independent).
 * One row per principal + SKU. Categories/type mirror the Dolibarr category chain.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pricing_products', function (Blueprint $t) {
            $t->id();
            $t->foreignId('principal_id')->constrained('pricing_principals')->cascadeOnDelete();

            $t->string('brand')->nullable();
            $t->string('sku_code');
            $t->string('product_name');
            $t->string('cat1')->nullable();
            $t->string('cat2')->nullable();
            $t->string('cat3')->nullable();
            $t->string('cat4')->nullable();
            $t->string('product_type')->nullable();   // instrument | implant | bhp
            $t->string('erp_ref')->nullable();

            // Principal price + FX.
            $t->char('currency_code', 3)->nullable();
            $t->decimal('price_principle', 15, 2)->default(0);
            $t->decimal('disc_principle_pct', 6, 3)->default(0);
            $t->decimal('kurs', 15, 2)->default(0);

            // Purchase / sales units.
            $t->decimal('qty_beli', 12, 2)->default(1);
            $t->string('uom_beli')->nullable();
            $t->decimal('qty_jual', 12, 2)->default(1);
            $t->string('uom_jual')->nullable();

            // Cost rates (%) — effective per product (seeded from profile/header, overridable).
            $t->decimal('bm_pct', 6, 3)->default(0);
            $t->decimal('pph22_pct', 6, 3)->default(0);
            $t->decimal('ppn_pct', 6, 3)->default(0);
            $t->decimal('shipment_pct', 6, 3)->default(0);

            $t->timestamps();
            $t->unique(['principal_id', 'sku_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pricing_products');
    }
};
