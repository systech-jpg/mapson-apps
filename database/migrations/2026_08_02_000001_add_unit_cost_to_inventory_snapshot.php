<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HPP resmi per item dari Accurate (item balanceUnitCost = biaya rata-rata pembukuan).
 * Diisi syncItemStock pada baris source=accurate; dipakai tab Analisa Cost dashboard
 * Warehouse sebagai sumber HPP utama (fallback: dwh_map_product_cost dari faktur).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dwh_fact_inventory_snapshot', function (Blueprint $table) {
            $table->decimal('unit_cost', 20, 2)->nullable()->after('unit_price');
        });
    }

    public function down(): void
    {
        Schema::table('dwh_fact_inventory_snapshot', function (Blueprint $table) {
            $table->dropColumn('unit_cost');
        });
    }
};
