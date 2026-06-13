<?php

namespace App\Services\Leave;

use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveType;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Computes & writes annual-leave entitlement (allotted + carried_over) per
 * employee/type/year. Accrual method comes from the leave type:
 *   - lump_sum      : full quota
 *   - prorata       : quota × (bulan kerja di tahun itu / 12)
 *   - tenure_based  : lump_sum bila masa kerja ≥ ambang (default 12 bln), else prorata
 */
class EntitlementService
{
    public function __construct(private LeaveBalanceService $balances)
    {
    }

    /** Accrue one type for one employee/year. Returns null if type not accruable. */
    public function accrue(Employee $employee, LeaveType $type, int $year): ?LeaveBalance
    {
        if ($type->accrual_method === 'none' || ! $type->requires_balance) {
            return null;
        }

        $yearStart = Carbon::create($year, 1, 1)->startOfDay();
        $yearEnd = Carbon::create($year, 12, 31)->endOfDay();
        $hire = $employee->hire_date ? Carbon::parse($employee->hire_date) : null;

        // Not yet employed within this year.
        if ($hire && $hire->gt($yearEnd)) {
            return null;
        }

        $effStart = ($hire && $hire->gt($yearStart)) ? $hire->copy() : $yearStart;
        $monthsThisYear = min(12, (int) $effStart->diffInMonths($yearEnd) + 1);

        $method = $type->accrual_method;
        if ($method === 'tenure_based') {
            $tenureMonths = $hire ? (int) $hire->diffInMonths(now()) : 999;
            $method = $tenureMonths >= (int) config('leave.tenure_months_for_lumpsum', 12) ? 'lump_sum' : 'prorata';
        }

        $quota = (float) $type->default_quota;
        $allotted = $method === 'lump_sum' ? $quota : round($quota * $monthsThisYear / 12, 1);
        $carried = $this->carryOverFromPreviousYear($employee, $type, $year);

        return DB::transaction(function () use ($employee, $type, $year, $allotted, $carried) {
            $b = LeaveBalance::firstOrCreate([
                'employee_id' => $employee->id,
                'leave_type_id' => $type->id,
                'year' => $year,
            ]);
            // Only (re)write entitlement components; preserve used/pending/adjustment.
            $b->allotted = $allotted;
            $b->carried_over = $carried;
            $b->save();

            return $b;
        });
    }

    /** Accrue all accruable types for every active employee for a year (cron). */
    public function accrueAll(int $year): int
    {
        $types = LeaveType::where('is_active', true)
            ->where('requires_balance', true)
            ->where('accrual_method', '!=', 'none')
            ->get();

        $count = 0;
        Employee::where('is_active', true)->whereNotNull('hire_date')->chunkById(200, function ($emps) use ($types, $year, &$count) {
            foreach ($emps as $e) {
                foreach ($types as $t) {
                    if ($this->accrue($e, $t, $year)) {
                        $count++;
                    }
                }
            }
        });

        return $count;
    }

    /** Leftover from last year, capped at the type's carry_over_max. */
    private function carryOverFromPreviousYear(Employee $employee, LeaveType $type, int $year): float
    {
        $max = (float) $type->carry_over_max;
        if ($max <= 0) {
            return 0.0;
        }

        $prev = LeaveBalance::query()
            ->where('employee_id', $employee->id)
            ->where('leave_type_id', $type->id)
            ->where('year', $year - 1)
            ->first();

        if (! $prev) {
            return 0.0;
        }

        $leftover = $this->balances->availableOf($prev);

        return max(0.0, min($leftover, $max));
    }
}
