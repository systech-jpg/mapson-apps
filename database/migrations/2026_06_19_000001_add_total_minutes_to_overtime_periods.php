<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('overtime_periods', function (Blueprint $t) {
            // Exact total duration in minutes (for H:MM display, no decimal rounding drift).
            $t->unsignedInteger('total_minutes')->default(0)->after('total_hours');
        });

        // Backfill existing rows from total_hours (exact for whole/half-hour data).
        DB::statement('UPDATE overtime_periods SET total_minutes = ROUND(total_hours * 60)');
    }

    public function down(): void
    {
        Schema::table('overtime_periods', fn (Blueprint $t) => $t->dropColumn('total_minutes'));
    }
};
