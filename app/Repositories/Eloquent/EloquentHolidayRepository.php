<?php

namespace App\Repositories\Eloquent;

use App\Models\LeaveHoliday;
use App\Repositories\Contracts\HolidayRepositoryInterface;

class EloquentHolidayRepository implements HolidayRepositoryInterface
{
    public function holidayDatesBetween(string $from, string $to): array
    {
        return LeaveHoliday::query()
            ->whereBetween('date', [$from, $to])
            ->where('is_workday_override', false)
            ->pluck('date')
            ->map(fn ($d) => $d->toDateString())
            ->all();
    }
}
