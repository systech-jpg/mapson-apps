<?php

namespace App\Services\Leave;

use App\Models\Employee;
use App\Models\LeaveApproval;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Orchestrates the leave-request lifecycle (state machine) and coordinates the
 * calculator, balance, and routing services. All mutations are transactional.
 */
class LeaveRequestService
{
    public function __construct(
        private LeaveCalculatorService $calculator,
        private LeaveBalanceService $balances,
        private ApprovalRoutingService $routing,
        private LeaveNotificationService $notifier,
    ) {
    }

    /**
     * Create & submit a request: validate → calc days → hold balance → route.
     *
     * @param  array{leave_type_id:int,start_date:string,end_date:string,day_part?:string,reason?:string,start_time?:string,end_time?:string}  $data
     */
    public function submit(Employee $employee, array $data, ?User $actor = null): LeaveRequest
    {
        $type = LeaveType::findOrFail($data['leave_type_id']);
        $start = Carbon::parse($data['start_date'])->startOfDay();
        $end = Carbon::parse($data['end_date'])->startOfDay();
        $dayPart = $data['day_part'] ?? 'full';

        $this->validate($employee, $type, $start, $end, $dayPart);

        $days = $this->calculator->effectiveDays($start->toDateString(), $end->toDateString(), $dayPart);
        if ($days <= 0) {
            throw new RuntimeException('Jumlah hari efektif 0 (rentang hanya berisi akhir pekan/hari libur).');
        }

        $year = $start->year;

        $request = DB::transaction(function () use ($employee, $type, $start, $end, $dayPart, $days, $year, $data, $actor) {
            $request = LeaveRequest::create([
                'request_number' => 'TMP',
                'employee_id' => $employee->id,
                'leave_type_id' => $type->id,
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
                'day_part' => $dayPart,
                'total_days' => $days,
                'start_time' => $data['start_time'] ?? null,
                'end_time' => $data['end_time'] ?? null,
                'year' => $year,
                'reason' => $data['reason'] ?? null,
                'status' => LeaveRequest::STATUS_DRAFT,
                'current_level' => 0,
                'created_by' => $actor?->id,
            ]);
            $request->update(['request_number' => 'LR-'.$year.'-'.str_pad((string) $request->id, 6, '0', STR_PAD_LEFT)]);

            // Hold balance (HALFDAY draws from ANNUAL).
            if ($bt = $this->balanceType($type)) {
                $this->balances->hold($employee->id, $bt->id, $year, $days);
            }

            // Build & persist approval steps.
            $steps = $this->routing->buildSteps($request);
            foreach ($steps as $s) {
                $request->approvals()->create([
                    'level' => $s['level'],
                    'role' => $s['role'],
                    'approver_employee_id' => $s['approver_employee_id'],
                    'status' => LeaveApproval::STATUS_PENDING,
                ]);
            }

            $first = $steps[0];
            $request->update([
                'status' => 'pending_'.$first['role'],
                'current_level' => 1,
                'submitted_at' => now(),
            ]);

            return $request->fresh('approvals');
        });

        $this->notifier->notifyPendingApprovers($request);

        return $request;
    }

    /**
     * HR direct entry: create an already-approved leave for an employee (e.g. from the
     * attendance recap). Skips min-notice/future-date rules (HR may backfill past dates),
     * commits balance immediately, and records a single approved HR step for the timeline.
     *
     * @param  array{leave_type_id:int,start_date:string,end_date?:string,day_part?:string,reason?:string}  $data
     */
    public function adminRecord(Employee $employee, array $data, ?User $actor = null): LeaveRequest
    {
        $type = LeaveType::findOrFail($data['leave_type_id']);
        $start = Carbon::parse($data['start_date'])->startOfDay();
        $end = Carbon::parse($data['end_date'] ?? $data['start_date'])->startOfDay();
        $dayPart = $data['day_part'] ?? 'full';

        $this->validateAdmin($employee, $type, $start, $end, $dayPart);

        $days = $this->calculator->effectiveDays($start->toDateString(), $end->toDateString(), $dayPart);
        if ($days <= 0) {
            throw new RuntimeException('Tanggal yang dipilih jatuh pada akhir pekan/hari libur (0 hari efektif).');
        }

        $year = $start->year;

        $request = DB::transaction(function () use ($employee, $type, $start, $end, $dayPart, $days, $year, $data, $actor) {
            $request = LeaveRequest::create([
                'request_number' => 'TMP',
                'employee_id' => $employee->id,
                'leave_type_id' => $type->id,
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
                'day_part' => $dayPart,
                'total_days' => $days,
                'year' => $year,
                'reason' => $data['reason'] ?? 'Input langsung oleh HR',
                'status' => LeaveRequest::STATUS_APPROVED,
                'current_level' => 1,
                'submitted_at' => now(),
                'decided_at' => now(),
                'decision_note' => 'Disetujui otomatis (input HR)',
                'created_by' => $actor?->id,
            ]);
            $request->update(['request_number' => 'LR-'.$year.'-'.str_pad((string) $request->id, 6, '0', STR_PAD_LEFT)]);

            // Hold then commit → straight to "used".
            if ($bt = $this->balanceType($type)) {
                $this->balances->hold($employee->id, $bt->id, $year, $days);
                $this->balances->commit($employee->id, $bt->id, $year, $days);
            }

            $request->approvals()->create([
                'level' => 1,
                'role' => 'hr',
                'approver_employee_id' => $actor?->employee?->id,
                'status' => LeaveApproval::STATUS_APPROVED,
                'notes' => 'Input langsung oleh HR',
                'acted_at' => now(),
            ]);

            return $request->fresh('approvals');
        });

        $this->notifier->notifyRequester($request, 'approved');

        return $request;
    }

    /** Approve the active step; advance or finalize (commit balance). */
    public function approve(LeaveRequest $request, Employee $approver, ?string $notes = null): LeaveRequest
    {
        $request = DB::transaction(function () use ($request, $approver, $notes) {
            $step = $this->activeStep($request);

            $step->update([
                'status' => LeaveApproval::STATUS_APPROVED,
                'approver_employee_id' => $step->approver_employee_id ?? $approver->id,
                'notes' => $notes,
                'acted_at' => now(),
            ]);

            $next = $request->approvals()->where('level', '>', $request->current_level)->orderBy('level')->first();

            if ($next) {
                $request->update(['current_level' => $next->level, 'status' => 'pending_'.$next->role]);
            } else {
                $request->update(['status' => LeaveRequest::STATUS_APPROVED, 'decided_at' => now()]);
                if ($bt = $this->balanceType($request->leaveType)) {
                    $this->balances->commit($request->employee_id, $bt->id, $request->year, (float) $request->total_days);
                }
            }

            return $request->fresh('approvals');
        });

        if ($request->status === LeaveRequest::STATUS_APPROVED) {
            $this->notifier->notifyRequester($request, 'approved');
        } else {
            $this->notifier->notifyPendingApprovers($request);
        }

        return $request;
    }

    /** Reject the active step → request rejected, release held balance. */
    public function reject(LeaveRequest $request, Employee $approver, ?string $notes = null): LeaveRequest
    {
        $request = DB::transaction(function () use ($request, $approver, $notes) {
            $step = $this->activeStep($request);

            $step->update([
                'status' => LeaveApproval::STATUS_REJECTED,
                'approver_employee_id' => $step->approver_employee_id ?? $approver->id,
                'notes' => $notes,
                'acted_at' => now(),
            ]);

            $request->update([
                'status' => LeaveRequest::STATUS_REJECTED,
                'decided_at' => now(),
                'decision_note' => $notes,
            ]);

            $this->releaseHold($request);

            return $request->fresh('approvals');
        });

        $this->notifier->notifyRequester($request, 'rejected');

        return $request;
    }

    /** Owner withdraws while still pending → release held balance. */
    public function withdraw(LeaveRequest $request): LeaveRequest
    {
        if (! $request->isPending()) {
            throw new RuntimeException('Hanya pengajuan yang masih menunggu yang bisa ditarik.');
        }

        return DB::transaction(function () use ($request) {
            $request->update(['status' => LeaveRequest::STATUS_WITHDRAWN, 'decided_at' => now()]);
            $this->releaseHold($request);

            return $request;
        });
    }

    /** Cancel: pending → release; approved & not started → reverse committed usage. */
    public function cancel(LeaveRequest $request, ?string $notes = null): LeaveRequest
    {
        return DB::transaction(function () use ($request, $notes) {
            $bt = $this->balanceType($request->leaveType);

            if ($request->isPending()) {
                $this->releaseHold($request);
            } elseif ($request->status === LeaveRequest::STATUS_APPROVED) {
                if (Carbon::parse($request->start_date)->isPast() && ! Carbon::parse($request->start_date)->isToday()) {
                    throw new RuntimeException('Cuti yang sudah berjalan/lewat tidak bisa dibatalkan; hubungi HR untuk koreksi.');
                }
                if ($bt) {
                    $this->balances->reverseCommit($request->employee_id, $bt->id, $request->year, (float) $request->total_days);
                }
            } else {
                throw new RuntimeException('Status pengajuan tidak bisa dibatalkan.');
            }

            $request->update([
                'status' => LeaveRequest::STATUS_CANCELLED,
                'decided_at' => now(),
                'decision_note' => $notes,
            ]);

            return $request;
        });
    }

    private function activeStep(LeaveRequest $request): LeaveApproval
    {
        $step = $request->approvals()
            ->where('level', $request->current_level)
            ->where('status', LeaveApproval::STATUS_PENDING)
            ->first();

        if (! $step) {
            throw new RuntimeException('Tidak ada langkah approval aktif untuk pengajuan ini.');
        }

        return $step;
    }

    private function releaseHold(LeaveRequest $request): void
    {
        if ($bt = $this->balanceType($request->leaveType)) {
            $this->balances->release($request->employee_id, $bt->id, $request->year, (float) $request->total_days);
        }
    }

    /** Which balance bucket a type consumes (HALFDAY → ANNUAL; else itself if it tracks balance). */
    private function balanceType(LeaveType $type): ?LeaveType
    {
        if ($type->code === 'HALFDAY') {
            return LeaveType::where('code', 'ANNUAL')->first();
        }

        return $type->requires_balance ? $type : null;
    }

    /** Validation for HR direct entry: no min-notice/future-date rule, but still guard conflicts. */
    private function validateAdmin(Employee $employee, LeaveType $type, Carbon $start, Carbon $end, string $dayPart): void
    {
        if (! $type->is_active) {
            throw new RuntimeException('Jenis cuti tidak aktif.');
        }
        if ($end->lt($start)) {
            throw new RuntimeException('Tanggal selesai tidak boleh sebelum tanggal mulai.');
        }
        if ($type->gender_constraint !== 'any' && $employee->gender && $employee->gender !== $type->gender_constraint) {
            throw new RuntimeException('Jenis cuti ini tidak berlaku untuk jenis kelamin karyawan.');
        }
        if ($dayPart !== 'full' && ! $type->allow_half_day) {
            throw new RuntimeException('Jenis cuti ini tidak mendukung setengah hari.');
        }

        $overlap = LeaveRequest::where('employee_id', $employee->id)
            ->whereIn('status', array_merge(LeaveRequest::PENDING_STATUSES, [LeaveRequest::STATUS_APPROVED]))
            ->where('start_date', '<=', $end->toDateString())
            ->where('end_date', '>=', $start->toDateString())
            ->exists();
        if ($overlap) {
            throw new RuntimeException('Sudah ada pengajuan/cuti yang menumpuk pada tanggal tersebut.');
        }
    }

    private function validate(Employee $employee, LeaveType $type, Carbon $start, Carbon $end, string $dayPart): void
    {
        if (! $type->is_active) {
            throw new RuntimeException('Jenis cuti tidak aktif.');
        }
        if ($end->lt($start)) {
            throw new RuntimeException('Tanggal selesai tidak boleh sebelum tanggal mulai.');
        }
        if ($type->gender_constraint !== 'any' && $employee->gender && $employee->gender !== $type->gender_constraint) {
            throw new RuntimeException('Jenis cuti ini tidak berlaku untuk jenis kelamin karyawan.');
        }
        if ($dayPart !== 'full' && ! $type->allow_half_day) {
            throw new RuntimeException('Jenis cuti ini tidak mendukung setengah hari.');
        }
        if ($type->min_notice_days > 0 && $start->lt(now()->startOfDay()->addDays($type->min_notice_days))) {
            throw new RuntimeException("Pengajuan minimal H-{$type->min_notice_days}.");
        }

        $overlap = LeaveRequest::where('employee_id', $employee->id)
            ->whereIn('status', array_merge(LeaveRequest::PENDING_STATUSES, [LeaveRequest::STATUS_APPROVED]))
            ->where('start_date', '<=', $end->toDateString())
            ->where('end_date', '>=', $start->toDateString())
            ->exists();
        if ($overlap) {
            throw new RuntimeException('Sudah ada pengajuan cuti yang menumpuk pada rentang tanggal ini.');
        }
    }
}
