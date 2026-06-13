<?php

namespace App\Services\Leave;

use Illuminate\Support\Carbon;

class LeaveCalculatorService
{
    public function __construct(private HolidayService $holidays)
    {
    }

    /**
     * Effective leave days in [from, to], excluding weekends (per config) and
     * holidays. day_part 'first_half'/'second_half' subtracts half a day
     * (so a single half day = 0.5).
     */
    public function effectiveDays(string $from, string $to, string $dayPart = 'full'): float
    {
        $start = Carbon::parse($from)->startOfDay();
        $end = Carbon::parse($to)->startOfDay();
        if ($end->lt($start)) {
            return 0.0;
        }

        $workdays = config('leave.workdays', [1, 2, 3, 4, 5]);
        $holidaySet = $this->holidays->holidaySet($start->toDateString(), $end->toDateString());

        $count = 0;
        for ($d = $start->copy(); $d->lte($end); $d->addDay()) {
            if (! in_array($d->isoWeekday(), $workdays, true)) {
                continue;
            }
            if (isset($holidaySet[$d->toDateString()])) {
                continue;
            }
            $count++;
        }

        if ($dayPart !== 'full' && $count > 0) {
            return $count - 0.5; // last working day counted as half
        }

        return (float) $count;
    }

    /** Convenience: count working days between two dates (no half-day). */
    public function workingDays(string $from, string $to): float
    {
        return $this->effectiveDays($from, $to, 'full');
    }
}
