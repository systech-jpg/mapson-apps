<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Revisi kunci harga: hanya L (pricelist) yang dikunci sebagai rupiah; E/G tidak lagi.
 * Sebagai gantinya masing-masing % jual bisa dikunci (flag) — saat L terkunci dan biaya/kurs
 * berubah, hanya % yang TIDAK terkunci yang menyesuaikan (skala prorata) agar L tetap.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pricing_product_prices', function (Blueprint $t) {
            $t->dropColumn(['locked_gudang', 'locked_bottom']);
            $t->boolean('lock_ops_pct')->default(false)->after('locked_pricelist');
            $t->boolean('lock_profit_pct')->default(false)->after('lock_ops_pct');
            $t->boolean('lock_komisi_pct')->default(false)->after('lock_profit_pct');
            $t->boolean('lock_event_pct')->default(false)->after('lock_komisi_pct');
            $t->boolean('lock_lainnya_pct')->default(false)->after('lock_event_pct');
        });
    }

    public function down(): void
    {
        Schema::table('pricing_product_prices', function (Blueprint $t) {
            $t->dropColumn(['lock_ops_pct', 'lock_profit_pct', 'lock_komisi_pct', 'lock_event_pct', 'lock_lainnya_pct']);
            $t->decimal('locked_gudang', 15, 2)->nullable()->after('rounding_step');
            $t->decimal('locked_bottom', 15, 2)->nullable()->after('locked_gudang');
        });
    }
};
