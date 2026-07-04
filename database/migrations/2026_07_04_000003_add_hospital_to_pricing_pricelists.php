<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pricing_pricelists', function (Blueprint $t) {
            $t->foreignId('hospital_id')->nullable()->after('profile_id')->constrained('pricing_hospitals')->nullOnDelete();
            $t->index(['product_id', 'profile_id', 'hospital_id', 'is_active'], 'pricelists_scope_active_idx');
        });
    }

    public function down(): void
    {
        Schema::table('pricing_pricelists', function (Blueprint $t) {
            $t->dropIndex('pricelists_scope_active_idx');
            $t->dropConstrainedForeignId('hospital_id');
        });
    }
};
