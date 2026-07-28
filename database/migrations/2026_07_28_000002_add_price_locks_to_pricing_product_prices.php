<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lockable price points: when set, E (harga gudang) / G (harga bawah) / L (pricelist) are
 * pinned to these values and the effective sell percentages are derived pro-rata instead.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pricing_product_prices', function (Blueprint $t) {
            $t->decimal('locked_gudang', 15, 2)->nullable()->after('rounding_step');   // E
            $t->decimal('locked_bottom', 15, 2)->nullable()->after('locked_gudang');   // G
            $t->decimal('locked_pricelist', 15, 2)->nullable()->after('locked_bottom'); // L
        });
    }

    public function down(): void
    {
        Schema::table('pricing_product_prices', function (Blueprint $t) {
            $t->dropColumn(['locked_gudang', 'locked_bottom', 'locked_pricelist']);
        });
    }
};
