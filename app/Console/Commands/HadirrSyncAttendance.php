<?php

namespace App\Console\Commands;

use App\Services\Hadirr\HadirrSyncService;
use Illuminate\Console\Command;

class HadirrSyncAttendance extends Command
{
    protected $signature = 'hadirr:sync-attendance {from : Tanggal awal (Y-m-d)} {to? : Tanggal akhir (Y-m-d, default = from)}';

    protected $description = 'Tarik karyawan + absensi Hadirr ke tabel staging (hadirr_employees, hadirr_attendances)';

    public function handle(HadirrSyncService $sync): int
    {
        $from = $this->argument('from');
        $to = $this->argument('to') ?? $from;

        try {
            $emp = $sync->syncEmployees();
            $this->info("Karyawan Hadirr: {$emp['total']} (terpetakan ke master: {$emp['matched']}).");

            $att = $sync->syncAttendances($from, $to, fn (string $m) => $this->line('  '.$m));
            $this->info("Absensi: {$att['rows']} baris dari {$att['days']} hari.");
        } catch (\Throwable $e) {
            $this->error('Gagal: '.$e->getMessage());

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
