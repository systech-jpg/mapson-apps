<?php

namespace Database\Seeders;

use App\Models\LeaveType;
use Illuminate\Database\Seeder;

class LeaveTypeSeeder extends Seeder
{
    public function run(): void
    {
        // Kuota & aturan = default (UU Ketenagakerjaan), semua dapat diubah dari master.
        $types = [
            [
                'code' => 'ANNUAL', 'name' => 'Cuti Tahunan', 'unit' => 'day',
                'is_paid' => true, 'requires_balance' => true, 'requires_attachment' => false,
                'allow_half_day' => true, 'gender_constraint' => 'any',
                'default_quota' => 12, 'accrual_method' => 'tenure_based',
                'min_notice_days' => 3, 'max_consecutive_days' => null,
                'carry_over_max' => 6, 'carry_over_expire_month' => 3,
                'color' => '#2563eb', 'sort_order' => 1,
            ],
            [
                'code' => 'SICK', 'name' => 'Cuti Sakit', 'unit' => 'day',
                'is_paid' => true, 'requires_balance' => false, 'requires_attachment' => true,
                'allow_half_day' => false, 'gender_constraint' => 'any',
                'default_quota' => 0, 'accrual_method' => 'none',
                'min_notice_days' => 0, 'max_consecutive_days' => null,
                'carry_over_max' => 0, 'carry_over_expire_month' => null,
                'color' => '#dc2626', 'sort_order' => 2,
            ],
            [
                'code' => 'MARRIAGE', 'name' => 'Cuti Menikah', 'unit' => 'day',
                'is_paid' => true, 'requires_balance' => false, 'requires_attachment' => true,
                'allow_half_day' => false, 'gender_constraint' => 'any',
                'default_quota' => 3, 'accrual_method' => 'none',
                'min_notice_days' => 14, 'max_consecutive_days' => 3,
                'carry_over_max' => 0, 'carry_over_expire_month' => null,
                'color' => '#db2777', 'sort_order' => 3,
            ],
            [
                'code' => 'MATERNITY', 'name' => 'Cuti Melahirkan', 'unit' => 'day',
                'is_paid' => true, 'requires_balance' => false, 'requires_attachment' => true,
                'allow_half_day' => false, 'gender_constraint' => 'female',
                'default_quota' => 90, 'accrual_method' => 'none',
                'min_notice_days' => 30, 'max_consecutive_days' => 90,
                'carry_over_max' => 0, 'carry_over_expire_month' => null,
                'color' => '#9333ea', 'sort_order' => 4,
            ],
            [
                'code' => 'PATERNITY', 'name' => 'Cuti Istri Melahirkan', 'unit' => 'day',
                'is_paid' => true, 'requires_balance' => false, 'requires_attachment' => false,
                'allow_half_day' => false, 'gender_constraint' => 'male',
                'default_quota' => 2, 'accrual_method' => 'none',
                'min_notice_days' => 3, 'max_consecutive_days' => 2,
                'carry_over_max' => 0, 'carry_over_expire_month' => null,
                'color' => '#0891b2', 'sort_order' => 5,
            ],
            [
                'code' => 'UNPAID', 'name' => 'Cuti Tanpa Gaji', 'unit' => 'day',
                'is_paid' => false, 'requires_balance' => false, 'requires_attachment' => false,
                'allow_half_day' => false, 'gender_constraint' => 'any',
                'default_quota' => 0, 'accrual_method' => 'none',
                'min_notice_days' => 7, 'max_consecutive_days' => null,
                'carry_over_max' => 0, 'carry_over_expire_month' => null,
                'color' => '#6b7280', 'sort_order' => 6,
            ],
            [
                'code' => 'PERMISSION', 'name' => 'Izin Pribadi', 'unit' => 'hour',
                'is_paid' => true, 'requires_balance' => false, 'requires_attachment' => false,
                'allow_half_day' => false, 'gender_constraint' => 'any',
                'default_quota' => 0, 'accrual_method' => 'none',
                'min_notice_days' => 0, 'max_consecutive_days' => null,
                'carry_over_max' => 0, 'carry_over_expire_month' => null,
                'color' => '#ca8a04', 'sort_order' => 7,
            ],
            [
                // Setengah hari = potong saldo Cuti Tahunan 0.5 (di-handle service).
                'code' => 'HALFDAY', 'name' => 'Setengah Hari', 'unit' => 'day',
                'is_paid' => true, 'requires_balance' => false, 'requires_attachment' => false,
                'allow_half_day' => true, 'gender_constraint' => 'any',
                'default_quota' => 0, 'accrual_method' => 'none',
                'min_notice_days' => 0, 'max_consecutive_days' => 1,
                'carry_over_max' => 0, 'carry_over_expire_month' => null,
                'color' => '#0d9488', 'sort_order' => 8,
            ],
            [
                'code' => 'WFH', 'name' => 'Work From Home', 'unit' => 'day',
                'is_paid' => true, 'requires_balance' => false, 'requires_attachment' => false,
                'allow_half_day' => false, 'gender_constraint' => 'any',
                'default_quota' => 0, 'accrual_method' => 'none',
                'min_notice_days' => 1, 'max_consecutive_days' => null,
                'carry_over_max' => 0, 'carry_over_expire_month' => null,
                'color' => '#16a34a', 'sort_order' => 9,
            ],
        ];

        foreach ($types as $t) {
            LeaveType::updateOrCreate(['code' => $t['code']], $t + ['is_active' => true]);
        }
    }
}
