<?php

namespace App\Support;

use App\Models\AttendanceSetting;
use Illuminate\Support\Carbon;

/**
 * Resolves the payroll attendance/overtime period. The start day is configurable in
 * Pengaturan Kepegawaian → Absensi (`attendance_settings.period_start_day`, default 20):
 * a period runs from that day of a month through the day before it in the next month
 * (e.g. 20 → 19). Start day 1 means a plain calendar month. Shared by the attendance
 * recap, attend case, and the overtime module.
 */
class AttendancePeriod
{
    public const DEFAULT_START_DAY = 20;

    private static ?int $startDay = null;

    /** Tanggal awal periode (1..28), dibaca sekali per request dari pengaturan. */
    public static function startDay(): int
    {
        if (self::$startDay === null) {
            try {
                $day = (int) AttendanceSetting::current()->period_start_day;
            } catch (\Throwable) {
                $day = self::DEFAULT_START_DAY;
            }
            self::$startDay = ($day >= 1 && $day <= 28) ? $day : self::DEFAULT_START_DAY;
        }

        return self::$startDay;
    }

    /** Buang cache (dipanggil setelah pengaturan disimpan / dari test). */
    public static function forget(): void
    {
        self::$startDay = null;
    }

    /**
     * @return array{0: string, 1: Carbon, 2: Carbon} [period (Y-m start month), from, to]
     */
    public static function resolve(?string $input): array
    {
        $defaultStart = Carbon::createFromFormat('Y-m', self::keyFor(Carbon::today()))->startOfMonth();

        $period = (string) ($input ?: $defaultStart->format('Y-m'));
        try {
            $startMonth = Carbon::createFromFormat('Y-m', $period)->startOfMonth();
        } catch (\Throwable) {
            $startMonth = $defaultStart;
            $period = $defaultStart->format('Y-m');
        }

        return [$period, self::from($startMonth), self::to($startMonth)];
    }

    /** Tanggal mulai periode untuk bulan awal tertentu. */
    public static function from(Carbon $startMonth): Carbon
    {
        return $startMonth->copy()->startOfMonth()->day(self::startDay());
    }

    /** Tanggal akhir periode: sehari sebelum tanggal awal di bulan berikutnya. */
    public static function to(Carbon $startMonth): Carbon
    {
        return self::from($startMonth)->addMonthNoOverflow()->subDay();
    }

    /** Kunci periode (Y-m bulan awal) yang memuat tanggal tersebut. */
    public static function keyFor(Carbon $date): string
    {
        $start = $date->day >= self::startDay() ? $date->copy()->startOfMonth() : $date->copy()->subMonthNoOverflow()->startOfMonth();

        return $start->format('Y-m');
    }

    public static function label(Carbon $from, Carbon $to): string
    {
        return $from->translatedFormat('d M Y').' – '.$to->translatedFormat('d M Y');
    }
}
