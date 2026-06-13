<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_types', function (Blueprint $t) {
            // none = tak ber-akrual (event/unpaid/WFH); lump_sum = penuh di awal;
            // prorata = per bulan; tenure_based = lump bila tetap & ≥1th, else prorata.
            $t->enum('accrual_method', ['none', 'lump_sum', 'prorata', 'tenure_based'])
                ->default('none')->after('default_quota');
        });
    }

    public function down(): void
    {
        Schema::table('leave_types', function (Blueprint $t) {
            $t->dropColumn('accrual_method');
        });
    }
};
