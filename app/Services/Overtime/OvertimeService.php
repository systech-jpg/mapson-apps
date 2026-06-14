<?php

namespace App\Services\Overtime;

use App\Models\Employee;
use App\Models\OvertimeApproval;
use App\Models\OvertimeEntry;
use App\Models\OvertimePeriod;
use App\Models\OvertimeSetting;
use App\Models\User;
use App\Support\AttendancePeriod;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Overtime lifecycle: a per-period header (20→19) holds per-activity detail entries.
 * Flow: employee fills entries → submit → supervisor reviews each row + approves the
 * period → HR approves the period (locks totals). Amount = hours × rate × multiplier
 * (workday vs weekend/holiday), rate snapshotted on the header at HR approval.
 */
class OvertimeService
{
    /** Get-or-create the employee's draft header for a period. */
    public function openPeriod(Employee $employee, ?string $periodInput = null, ?User $actor = null): OvertimePeriod
    {
        [$period, $from, $to] = AttendancePeriod::resolve($periodInput);

        $p = OvertimePeriod::firstOrCreate(
            ['employee_id' => $employee->id, 'period' => $period],
            [
                'request_number' => 'TMP',
                'period_start' => $from->toDateString(),
                'period_end' => $to->toDateString(),
                'status' => OvertimePeriod::STATUS_DRAFT,
                'created_by' => $actor?->id,
            ]
        );

        if ($p->request_number === 'TMP') {
            $p->update(['request_number' => 'OT-'.$from->year.'-'.str_pad((string) $p->id, 6, '0', STR_PAD_LEFT)]);
        }

        return $p;
    }

    public function addEntry(OvertimePeriod $period, array $data): OvertimeEntry
    {
        $this->assertEditable($period);
        $date = Carbon::parse($data['date'])->startOfDay();
        $this->assertWithinPeriod($period, $date);

        $entry = $period->entries()->create([
            'date' => $date->toDateString(),
            'activity' => $data['activity'],
            'start_time' => $data['start_time'],
            'end_time' => $data['end_time'],
            'hours' => $this->computeHours($data['start_time'], $data['end_time']),
            'is_holiday' => $this->isHoliday($date),
            'status' => OvertimeEntry::STATUS_PENDING,
            'note' => $data['note'] ?? null,
        ]);

        $this->recomputeTotals($period->fresh());

        return $entry;
    }

    public function updateEntry(OvertimeEntry $entry, array $data): OvertimeEntry
    {
        $period = $entry->period;
        $this->assertEditable($period);
        $date = Carbon::parse($data['date'])->startOfDay();
        $this->assertWithinPeriod($period, $date);

        $entry->update([
            'date' => $date->toDateString(),
            'activity' => $data['activity'],
            'start_time' => $data['start_time'],
            'end_time' => $data['end_time'],
            'hours' => $this->computeHours($data['start_time'], $data['end_time']),
            'is_holiday' => $this->isHoliday($date),
            'note' => $data['note'] ?? null,
        ]);

        $this->recomputeTotals($period->fresh());

        return $entry;
    }

    public function deleteEntry(OvertimeEntry $entry): void
    {
        $period = $entry->period;
        $this->assertEditable($period);
        $entry->delete();
        $this->recomputeTotals($period->fresh());
    }

    /** Submit the period for approval (or resubmit after rejection). */
    public function submit(OvertimePeriod $period): OvertimePeriod
    {
        $this->assertEditable($period);
        if ($period->entries()->count() === 0) {
            throw new RuntimeException('Belum ada entri lembur untuk diajukan.');
        }

        return DB::transaction(function () use ($period) {
            $period->approvals()->delete();                                  // reset on resubmit
            $period->entries()->update(['status' => OvertimeEntry::STATUS_PENDING, 'decided_by' => null, 'decided_at' => null]);

            $level = 1;
            $steps = [];
            if ($supId = $period->employee->reports_to_employee_id) {
                $steps[] = ['level' => $level++, 'role' => 'supervisor', 'approver_employee_id' => $supId];
            }
            $steps[] = ['level' => $level++, 'role' => 'hr', 'approver_employee_id' => null];

            foreach ($steps as $s) {
                $period->approvals()->create($s + ['status' => OvertimeApproval::STATUS_PENDING]);
            }

            $period->update([
                'status' => 'pending_'.$steps[0]['role'],
                'current_level' => 1,
                'submitted_at' => now(),
                'decided_at' => null,
                'decision_note' => null,
            ]);

            $this->recomputeTotals($period->fresh());

            return $period->fresh(['approvals', 'entries']);
        });
    }

    /** Supervisor decision on a single detail row (approve/reject the activity). */
    public function decideEntry(OvertimeEntry $entry, string $status, User $actor): OvertimeEntry
    {
        $period = $entry->period;
        if ($period->status !== OvertimePeriod::STATUS_PENDING_SUPERVISOR) {
            throw new RuntimeException('Baris hanya bisa dinilai saat periode menunggu persetujuan atasan.');
        }
        if (! in_array($status, [OvertimeEntry::STATUS_APPROVED, OvertimeEntry::STATUS_REJECTED], true)) {
            throw new RuntimeException('Status baris tidak valid.');
        }

        $entry->update(['status' => $status, 'decided_by' => optional($actor->employee)->id, 'decided_at' => now()]);
        $this->recomputeTotals($period->fresh());

        return $entry;
    }

    /** Approve the active period step; advance, or finalize + snapshot rate at HR. */
    public function approve(OvertimePeriod $period, User $actor, ?string $notes = null): OvertimePeriod
    {
        return DB::transaction(function () use ($period, $actor, $notes) {
            $step = $this->activeApproval($period);
            $approverEmpId = $step->approver_employee_id ?? optional($actor->employee)->id;

            $step->update([
                'status' => OvertimeApproval::STATUS_APPROVED,
                'approver_employee_id' => $approverEmpId,
                'notes' => $notes,
                'acted_at' => now(),
            ]);

            // When the supervisor signs off, remaining un-reviewed rows count as approved.
            if ($step->role === 'supervisor') {
                $period->entries()->where('status', OvertimeEntry::STATUS_PENDING)
                    ->update(['status' => OvertimeEntry::STATUS_APPROVED, 'decided_by' => $approverEmpId, 'decided_at' => now()]);
            }

            $next = $period->approvals()->where('level', '>', $period->current_level)->orderBy('level')->first();

            if ($next) {
                $period->update(['current_level' => $next->level, 'status' => 'pending_'.$next->role]);
            } else {
                $s = OvertimeSetting::current();
                $period->update([
                    'status' => OvertimePeriod::STATUS_APPROVED,
                    'decided_at' => now(),
                    'rate_per_hour' => $s->rate_per_hour,
                    'multiplier_workday' => $s->multiplier_workday,
                    'multiplier_holiday' => $s->multiplier_holiday,
                ]);
            }

            $this->recomputeTotals($period->fresh());

            return $period->fresh(['approvals', 'entries']);
        });
    }

    /** Reject the active step → period rejected (employee may revise & resubmit). */
    public function reject(OvertimePeriod $period, User $actor, ?string $notes = null): OvertimePeriod
    {
        return DB::transaction(function () use ($period, $actor, $notes) {
            $step = $this->activeApproval($period);
            $step->update([
                'status' => OvertimeApproval::STATUS_REJECTED,
                'approver_employee_id' => $step->approver_employee_id ?? optional($actor->employee)->id,
                'notes' => $notes,
                'acted_at' => now(),
            ]);

            $period->update([
                'status' => OvertimePeriod::STATUS_REJECTED,
                'decided_at' => now(),
                'decision_note' => $notes,
            ]);

            return $period->fresh(['approvals', 'entries']);
        });
    }

    /** Recalculate header totals from non-rejected entries (uses snapshot rate once approved). */
    public function recomputeTotals(OvertimePeriod $period): void
    {
        $snapshot = $period->status === OvertimePeriod::STATUS_APPROVED && $period->rate_per_hour !== null;
        $s = OvertimeSetting::current();
        $rate = (float) ($snapshot ? $period->rate_per_hour : $s->rate_per_hour);
        $mw = (float) ($snapshot ? $period->multiplier_workday : $s->multiplier_workday);
        $mh = (float) ($snapshot ? $period->multiplier_holiday : $s->multiplier_holiday);

        $hours = 0.0;
        $amount = 0.0;
        foreach ($period->entries()->where('status', '!=', OvertimeEntry::STATUS_REJECTED)->get() as $e) {
            $hours += (float) $e->hours;
            $amount += (float) $e->hours * $rate * ($e->is_holiday ? $mh : $mw);
        }

        $period->update(['total_hours' => $hours, 'total_amount' => $amount]);
    }

    /** Can this user act on the period's current pending step? */
    public function canApprove(OvertimePeriod $period, User $user): bool
    {
        if (! $period->isPending()) {
            return false;
        }
        $step = $period->approvals()->where('level', $period->current_level)->where('status', OvertimeApproval::STATUS_PENDING)->first();
        if (! $step) {
            return false;
        }
        if ($step->role === 'supervisor') {
            return $step->approver_employee_id && optional($user->employee)->id === $step->approver_employee_id;
        }

        // HR: any holder of an HR role, but not approving own period.
        return $this->userIsHr($user) && optional($user->employee)->id !== $period->employee_id;
    }

    public function userIsHr(User $user): bool
    {
        $slugs = (array) config('leave.approver_roles.hr', ['hr-admin']);

        return in_array(optional($user->role)->slug, $slugs, true);
    }

    private function activeApproval(OvertimePeriod $period): OvertimeApproval
    {
        $step = $period->approvals()->where('level', $period->current_level)->where('status', OvertimeApproval::STATUS_PENDING)->first();
        if (! $step) {
            throw new RuntimeException('Tidak ada langkah approval aktif untuk periode ini.');
        }

        return $step;
    }

    private function assertEditable(OvertimePeriod $period): void
    {
        if (! $period->isEditable()) {
            throw new RuntimeException('Periode lembur sudah diajukan/diputus dan tidak bisa diubah.');
        }
    }

    private function assertWithinPeriod(OvertimePeriod $period, Carbon $date): void
    {
        if ($date->lt($period->period_start) || $date->gt($period->period_end)) {
            throw new RuntimeException('Tanggal di luar rentang periode ('.$period->period_start->format('d M').' – '.$period->period_end->format('d M Y').').');
        }
    }

    private function computeHours(string $start, string $end): float
    {
        $s = Carbon::parse($start);
        $e = Carbon::parse($end);
        $minutes = $e->gt($s) ? $s->diffInMinutes($e) : $s->diffInMinutes($e->copy()->addDay());

        return round($minutes / 60, 2);
    }

    private function isHoliday(Carbon $date): bool
    {
        if ($date->isoWeekday() >= 6) {
            return true;
        }

        return DB::table('leave_holidays')->where('date', $date->toDateString())->exists();
    }
}
