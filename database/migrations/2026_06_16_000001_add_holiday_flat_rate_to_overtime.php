<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('overtime_settings', function (Blueprint $t) {
            // Flat fee per holiday/weekend day (regardless of hours).
            $t->decimal('holiday_flat_rate', 12, 2)->default(0)->after('multiplier_holiday');
        });

        Schema::table('overtime_periods', function (Blueprint $t) {
            $t->decimal('holiday_flat_rate', 12, 2)->nullable()->after('multiplier_holiday'); // snapshot at HR approval
        });
    }

    public function down(): void
    {
        Schema::table('overtime_settings', fn (Blueprint $t) => $t->dropColumn('holiday_flat_rate'));
        Schema::table('overtime_periods', fn (Blueprint $t) => $t->dropColumn('holiday_flat_rate'));
    }
};
