<?php

namespace App\Console\Commands;

use App\Services\Leave\EntitlementService;
use Illuminate\Console\Command;

class LeaveAccrue extends Command
{
    protected $signature = 'leave:accrue {year? : Tahun saldo (default tahun berjalan)}';

    protected $description = 'Hitung & tulis hak cuti (allotted + carry-over) untuk semua karyawan aktif';

    public function handle(EntitlementService $entitlement): int
    {
        $year = (int) ($this->argument('year') ?: now()->year);

        $this->info("Menjalankan akrual cuti tahun {$year}…");
        $count = $entitlement->accrueAll($year);
        $this->info("Selesai: {$count} saldo diperbarui.");

        return self::SUCCESS;
    }
}
