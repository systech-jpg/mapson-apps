<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('overtime_entries', function (Blueprint $t) {
            // Per-day overtime nominal (Rp). Derived in OvertimeService::recomputeTotals.
            $t->decimal('amount', 12, 2)->default(0)->after('hours');
        });

        // Backfill existing rows using snapshot rate (period) falling back to current settings.
        DB::statement(<<<'SQL'
            UPDATE overtime_entries e
            JOIN overtime_periods p ON p.id = e.overtime_period_id
            SET e.amount = CASE
                WHEN e.status = 'rejected' THEN 0
                WHEN e.is_holiday = 1
                    THEN COALESCE(p.holiday_flat_rate, (SELECT holiday_flat_rate FROM overtime_settings ORDER BY id LIMIT 1), 0)
                ELSE e.hours
                    * COALESCE(p.rate_per_hour, (SELECT rate_per_hour FROM overtime_settings ORDER BY id LIMIT 1), 0)
                    * COALESCE(p.multiplier_workday, (SELECT multiplier_workday FROM overtime_settings ORDER BY id LIMIT 1), 1)
            END
        SQL);
    }

    public function down(): void
    {
        Schema::table('overtime_entries', fn (Blueprint $t) => $t->dropColumn('amount'));
    }
};
