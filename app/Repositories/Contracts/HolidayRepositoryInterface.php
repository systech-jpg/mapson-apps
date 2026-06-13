<?php

namespace App\Repositories\Contracts;

interface HolidayRepositoryInterface
{
    /**
     * Effective holiday dates within [from, to] (excludes workday overrides).
     *
     * @return array<int, string>  list of 'Y-m-d'
     */
    public function holidayDatesBetween(string $from, string $to): array;
}
