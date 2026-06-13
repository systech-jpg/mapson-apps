<?php

namespace Database\Seeders;

use App\Models\LeaveHoliday;
use Illuminate\Database\Seeder;

class LeaveHolidaySeeder extends Seeder
{
    public function run(): void
    {
        // Hari libur nasional bertanggal TETAP 2026 (pasti). Hari libur variabel
        // (Imlek, Nyepi, Idul Fitri/Adha, Waisak, Isra Mikraj, Kenaikan, Wafat Isa,
        // Maulid) & cuti bersama menyusul SKB resmi — tambahkan via menu Hari Libur.
        $holidays = [
            ['date' => '2026-01-01', 'name' => 'Tahun Baru Masehi'],
            ['date' => '2026-05-01', 'name' => 'Hari Buruh Internasional'],
            ['date' => '2026-06-01', 'name' => 'Hari Lahir Pancasila'],
            ['date' => '2026-08-17', 'name' => 'Hari Kemerdekaan RI'],
            ['date' => '2026-12-25', 'name' => 'Hari Raya Natal'],
        ];

        foreach ($holidays as $h) {
            LeaveHoliday::updateOrCreate(
                ['date' => $h['date']],
                ['name' => $h['name'], 'type' => 'national', 'is_workday_override' => false],
            );
        }
    }
}
