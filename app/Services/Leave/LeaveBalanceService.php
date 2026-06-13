<?php

namespace App\Services\Leave;

use App\Exceptions\InsufficientLeaveBalanceException;
use App\Models\LeaveBalance;
use Illuminate\Support\Facades\DB;

/**
 * Single-writer for leave_balances. Every mutation runs inside a transaction
 * with a row lock to stay consistent under concurrent approvals.
 *
 * Lifecycle: hold (submit) → commit (final approve) → or release (reject/cancel).
 */
class LeaveBalanceService
{
    private const EPSILON = 0.0001;

    /** Available = allotted + carried_over + adjustment − used − pending. */
    public function available(int $employeeId, int $leaveTypeId, int $year): float
    {
        $b = LeaveBalance::query()
            ->where('employee_id', $employeeId)
            ->where('leave_type_id', $leaveTypeId)
            ->where('year', $year)
            ->first();

        return $b ? $this->availableOf($b) : 0.0;
    }

    public function availableOf(LeaveBalance $b): float
    {
        return (float) $b->allotted + (float) $b->carried_over + (float) $b->adjustment
            - (float) $b->used - (float) $b->pending;
    }

    /** Reserve days while a request awaits approval. */
    public function hold(int $employeeId, int $leaveTypeId, int $year, float $days): LeaveBalance
    {
        return DB::transaction(function () use ($employeeId, $leaveTypeId, $year, $days) {
            $b = $this->lockBucket($employeeId, $leaveTypeId, $year);
            $available = $this->availableOf($b);
            if ($available + self::EPSILON < $days) {
                throw new InsufficientLeaveBalanceException($days, $available);
            }
            $b->pending = (float) $b->pending + $days;
            $b->save();

            return $b;
        });
    }

    /** Move a previously held amount into 'used' (on final approval). */
    public function commit(int $employeeId, int $leaveTypeId, int $year, float $days): LeaveBalance
    {
        return DB::transaction(function () use ($employeeId, $leaveTypeId, $year, $days) {
            $b = $this->lockBucket($employeeId, $leaveTypeId, $year);
            $b->pending = max(0, (float) $b->pending - $days);
            $b->used = (float) $b->used + $days;
            $b->save();

            return $b;
        });
    }

    /** Return a held amount (on reject/withdraw/cancel before commit). */
    public function release(int $employeeId, int $leaveTypeId, int $year, float $days): LeaveBalance
    {
        return DB::transaction(function () use ($employeeId, $leaveTypeId, $year, $days) {
            $b = $this->lockBucket($employeeId, $leaveTypeId, $year);
            $b->pending = max(0, (float) $b->pending - $days);
            $b->save();

            return $b;
        });
    }

    /** Reverse a committed leave (cancel after approval) → used back to available. */
    public function reverseCommit(int $employeeId, int $leaveTypeId, int $year, float $days): LeaveBalance
    {
        return DB::transaction(function () use ($employeeId, $leaveTypeId, $year, $days) {
            $b = $this->lockBucket($employeeId, $leaveTypeId, $year);
            $b->used = max(0, (float) $b->used - $days);
            $b->save();

            return $b;
        });
    }

    /** HR manual adjustment (+/-). */
    public function adjust(int $employeeId, int $leaveTypeId, int $year, float $delta): LeaveBalance
    {
        return DB::transaction(function () use ($employeeId, $leaveTypeId, $year, $delta) {
            $b = $this->lockBucket($employeeId, $leaveTypeId, $year);
            $b->adjustment = (float) $b->adjustment + $delta;
            $b->save();

            return $b;
        });
    }

    /** Get (or create) the bucket row with a write lock. Call inside a transaction. */
    private function lockBucket(int $employeeId, int $leaveTypeId, int $year): LeaveBalance
    {
        LeaveBalance::firstOrCreate([
            'employee_id' => $employeeId,
            'leave_type_id' => $leaveTypeId,
            'year' => $year,
        ]);

        return LeaveBalance::query()
            ->where('employee_id', $employeeId)
            ->where('leave_type_id', $leaveTypeId)
            ->where('year', $year)
            ->lockForUpdate()
            ->first();
    }
}
