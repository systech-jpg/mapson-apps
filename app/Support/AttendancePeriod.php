<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * Resolves the payroll attendance/overtime period: the 20th of a month through the
 * 19th of the next. Shared by the attendance recap and the overtime module.
 */
class AttendancePeriod
{
    /**
     * @return array{0: string, 1: Carbon, 2: Carbon} [period (Y-m start month), from, to]
     */
    public static function resolve(?string $input): array
    {
        $today = Carbon::today();
        $defaultStart = $today->day >= 20 ? $today->copy()->startOfMonth() : $today->copy()->subMonthNoOverflow()->startOfMonth();

        $period = (string) ($input ?: $defaultStart->format('Y-m'));
        try {
            $startMonth = Carbon::createFromFormat('Y-m', $period)->startOfMonth();
        } catch (\Throwable) {
            $startMonth = $defaultStart;
            $period = $defaultStart->format('Y-m');
        }

        return [$period, $startMonth->copy()->day(20), $startMonth->copy()->addMonthNoOverflow()->day(19)];
    }

    public static function label(Carbon $from, Carbon $to): string
    {
        return $from->translatedFormat('d M Y').' – '.$to->translatedFormat('d M Y');
    }
}
