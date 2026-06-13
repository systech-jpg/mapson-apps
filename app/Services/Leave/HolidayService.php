<?php

namespace App\Services\Leave;

use App\Repositories\Contracts\HolidayRepositoryInterface;

class HolidayService
{
    public function __construct(private HolidayRepositoryInterface $holidays)
    {
    }

    /**
     * Effective holiday dates within the range, as a fast lookup set [date => true].
     *
     * @return array<string, bool>
     */
    public function holidaySet(string $from, string $to): array
    {
        return array_fill_keys($this->holidays->holidayDatesBetween($from, $to), true);
    }

    public function isHoliday(string $date): bool
    {
        return ! empty($this->holidays->holidayDatesBetween($date, $date));
    }
}
