<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Add the optional hospital dimension to prices. The unique key becomes
 * (product, profile, hospital_id). A null hospital_id is the base row; app-level upserts
 * (keyed on product+profile+hospital_id) keep at most one base per product+profile.
 * Written defensively so it is safe to re-run after a partial failure.
 */
return new class extends Migration
{
    public function up(): void
    {
        $hasIndex = fn (string $name) => collect(DB::select('SHOW INDEX FROM pricing_product_prices WHERE Key_name = ?', [$name]))->isNotEmpty();

        if (! Schema::hasColumn('pricing_product_prices', 'hospital_id')) {
            Schema::table('pricing_product_prices', function (Blueprint $t) {
                $t->foreignId('hospital_id')->nullable()->after('profile_id')->constrained('pricing_hospitals')->nullOnDelete();
            });
        }
        if (! $hasIndex('ppp_product_idx')) {
            Schema::table('pricing_product_prices', fn (Blueprint $t) => $t->index('product_id', 'ppp_product_idx'));
        }
        if ($hasIndex('pricing_product_prices_product_id_profile_id_unique')) {
            Schema::table('pricing_product_prices', fn (Blueprint $t) => $t->dropUnique('pricing_product_prices_product_id_profile_id_unique'));
        }
        if (! $hasIndex('ppp_scope_unique')) {
            Schema::table('pricing_product_prices', fn (Blueprint $t) => $t->unique(['product_id', 'profile_id', 'hospital_id'], 'ppp_scope_unique'));
        }
    }

    public function down(): void
    {
        Schema::table('pricing_product_prices', function (Blueprint $t) {
            $t->dropUnique('ppp_scope_unique');
            $t->dropConstrainedForeignId('hospital_id');
            $t->dropIndex('ppp_product_idx');
            $t->unique(['product_id', 'profile_id']);
        });
    }
};
