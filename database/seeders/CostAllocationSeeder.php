<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Alokasi DEFAULT akun GL → pool ABC (dwh_map_cost_allocation).
 *
 * - Akun DEDICATED → 100% satu pool (yakin, tak perlu disesuaikan).
 * - Akun BERSAMA (gaji, gedung, business travel, komisi) → split % DEFAULT, ditandai
 *   "[DEFAULT]" di note supaya jelas HARUS disesuaikan lewat UI (khususnya gaji: owner
 *   yang menetapkan). Sum % per akun = 100 agar invariant tie-back GL terjaga.
 *
 * effective_from '2000-01' = berlaku untuk semua periode sampai ada versi lebih baru.
 * Idempoten: updateOrInsert per (account_code, cost_pool_code, effective_from).
 */
class CostAllocationSeeder extends Seeder
{
    public function run(): void
    {
        // Split gaji DEFAULT per departemen (dipakai ulang utk seluruh keluarga gaji/tunjangan).
        // WAJIB disesuaikan owner — ini cuma agar engine bisa jalan.
        $salarySplit = [
            'management' => 40, 'sales' => 20, 'storage' => 10,
            'delivery' => 10, 'attend' => 10, 'finance' => 5, 'it' => 5,
        ];
        $salaryAccounts = ['62100001', '62100003', '62100007', '62100006', '62100005', '62100002'];

        // Split gedung DEFAULT: gudang di lt.4 dari 4 lantai → 27% storage, sisanya admin.
        $buildingSplit = ['storage' => 27, 'management' => 73];
        $buildingAccounts = ['62900001', '62900004', '6321000', '6400001', '6350000'];

        $rows = [];
        $add = function (string $acc, string $pool, float $pct, ?string $note = null) use (&$rows) {
            $rows[] = compact('acc', 'pool', 'pct', 'note');
        };

        // --- DEDICATED (100%) ---
        $direct = [
            // HPP / landed
            '5100000' => 'hpp', '5400000' => 'hpp', '5500000' => 'hpp',
            // Delivery (kendaraan)
            '6380000' => 'delivery', '62900003' => 'delivery', '6318000' => 'delivery',
            // Sales & marketing
            '6130000' => 'sales', '6120000' => 'sales', '6110000' => 'sales',
            // IT
            '6370000' => 'it',
            // Finance
            '7500000' => 'finance', '7600000' => 'finance', '7200000' => 'finance',
            '720101' => 'finance', '720201' => 'finance', '7700000' => 'finance', '7800000' => 'finance',
            // Management / admin (penampung)
            '6328000' => 'management', '6314000' => 'management', '6316000' => 'management',
            '6319000' => 'management', '6311000' => 'management', '6399000' => 'management',
            '6329000' => 'management', '6310000' => 'management', '6309000' => 'management',
            '6320000' => 'management', '6330000' => 'management', '6399001' => 'management',
            '7100000' => 'management', '7999000' => 'management', '6313000' => 'management',
            '6360000' => 'management', // Leasing Interest — default admin (bisa dibagi ke delivery/storage nanti)
        ];
        foreach ($direct as $acc => $pool) {
            $add($acc, $pool, 100);
        }

        // --- SHARED: gaji & tunjangan ---
        foreach ($salaryAccounts as $acc) {
            foreach ($salarySplit as $pool => $pct) {
                $add($acc, $pool, $pct, '[DEFAULT] split gaji per-departemen — sesuaikan (owner).');
            }
        }

        // --- SHARED: biaya gedung ---
        foreach ($buildingAccounts as $acc) {
            foreach ($buildingSplit as $pool => $pct) {
                $add($acc, $pool, $pct, '[DEFAULT] gedung: 27% gudang / 73% admin — sesuaikan.');
            }
        }

        // --- SHARED: Business Travell (attend + sales + admin) & Commision (sales + attend) ---
        foreach (['attend' => 40, 'sales' => 30, 'management' => 30] as $pool => $pct) {
            $add('6390000', $pool, $pct, '[DEFAULT] Business Travell: attend/sales/admin — sesuaikan.');
        }
        foreach (['sales' => 70, 'attend' => 30] as $pool => $pct) {
            $add('6140001', $pool, $pct, '[DEFAULT] Commision: sales/attend — sesuaikan.');
        }

        $now = now();
        foreach ($rows as $r) {
            DB::table('dwh_map_cost_allocation')->updateOrInsert(
                ['account_code' => $r['acc'], 'cost_pool_code' => $r['pool'], 'effective_from' => '2000-01'],
                ['pct' => $r['pct'], 'note' => $r['note'], 'updated_at' => $now, 'created_at' => $now],
            );
        }

        $this->command?->info(sprintf('Alokasi default: %d baris untuk %d akun.',
            count($rows), collect($rows)->pluck('acc')->unique()->count()));
    }
}
