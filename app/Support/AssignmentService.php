<?php

namespace App\Support;

use App\Models\Employee;
use App\Models\EmployeeAssignment;
use App\Models\Position;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AssignmentService
{
    /**
     * Organizational fields copied between an assignment row and the employee snapshot.
     *
     * @var array<int, string>
     */
    protected array $orgFields = [
        'company_id', 'org_unit_id', 'position_id', 'job_catalog_id', 'job_grade_id', 'cost_center_id',
        'location_id', 'employee_group_id', 'employee_subgroup_id', 'employment_type_id',
        'employment_status', 'reports_to_employee_id',
    ];

    /**
     * Apply a new effective-dated assignment, close the previous period, and refresh
     * the employee's denormalized current_* snapshot — all in one transaction.
     *
     * @param  array<string, mixed>  $data
     */
    public function apply(Employee $employee, array $data, ?User $actor = null): EmployeeAssignment
    {
        $validFrom = Carbon::parse($data['valid_from'] ?? now())->startOfDay();
        $today = now()->startOfDay();
        $isCurrent = $validFrom->lte($today);

        return DB::transaction(function () use ($employee, $data, $actor, $validFrom, $isCurrent, $today) {
            // 1) Close the row currently in effect (if its period starts earlier).
            $previous = $employee->assignments()
                ->where('valid_from', '<=', $validFrom)
                ->orderByDesc('valid_from')
                ->orderByDesc('id')
                ->first();

            if ($previous) {
                if ($previous->valid_from->equalTo($validFrom)) {
                    // Same-day correction: replace the previous row to avoid a zero-length period.
                    $previous->delete();
                } else {
                    $newValidTo = $validFrom->copy()->subDay();
                    // Keep the closed row flagged current if its (now shortened) period still covers today —
                    // this matters when the new assignment is future-dated.
                    $stillCurrent = $previous->valid_from->lte($today) && $newValidTo->gte($today);
                    $previous->update([
                        'valid_to' => $newValidTo,
                        'is_current' => $stillCurrent,
                    ]);
                }
            }

            // 2) Defensive: no other row may stay flagged current.
            if ($isCurrent) {
                $employee->assignments()->where('is_current', true)->update(['is_current' => false]);
            }

            // 3) Create the new assignment row.
            $payload = ['action_type' => $data['action_type'] ?? 'transfer'];
            foreach ($this->orgFields as $field) {
                $payload[$field] = $data[$field] ?? null;
            }
            $payload['employment_status'] = $data['employment_status'] ?? 'active';
            $payload['valid_from'] = $validFrom;
            $payload['valid_to'] = null;
            $payload['is_current'] = $isCurrent;
            $payload['reason'] = $data['reason'] ?? null;
            $payload['notes'] = $data['notes'] ?? null;
            $payload['created_by'] = $actor?->id;

            $assignment = $employee->assignments()->create($payload);

            // 4) Refresh snapshot + position vacancy only if this row is in effect today.
            if ($isCurrent) {
                $snapshot = [];
                foreach ($this->orgFields as $field) {
                    $snapshot['current_'.$field] = $payload[$field];
                }
                // employment_status / reports_to_employee_id map to non-prefixed snapshot cols.
                unset($snapshot['current_employment_status'], $snapshot['current_reports_to_employee_id']);
                $snapshot['current_employment_status'] = $payload['employment_status'];
                $snapshot['reports_to_employee_id'] = $payload['reports_to_employee_id'];
                $snapshot['current_effective_date'] = $validFrom;

                if (($payload['action_type'] ?? null) === 'termination') {
                    $snapshot['termination_date'] = $validFrom;
                }

                $employee->forceFill($snapshot)->save();

                $this->syncPositionVacancy($previous?->position_id, $payload['position_id']);
            }

            return $assignment;
        });
    }

    public function hire(Employee $employee, array $data, ?User $actor = null): EmployeeAssignment
    {
        return $this->apply($employee, ['action_type' => 'hire'] + $data, $actor);
    }

    public function transfer(Employee $employee, array $data, ?User $actor = null): EmployeeAssignment
    {
        return $this->apply($employee, ['action_type' => 'transfer'] + $data, $actor);
    }

    public function promote(Employee $employee, array $data, ?User $actor = null): EmployeeAssignment
    {
        return $this->apply($employee, ['action_type' => 'promotion'] + $data, $actor);
    }

    public function changeStatus(Employee $employee, array $data, ?User $actor = null): EmployeeAssignment
    {
        return $this->apply($employee, ['action_type' => 'status_change'] + $data, $actor);
    }

    public function terminate(Employee $employee, array $data, ?User $actor = null): EmployeeAssignment
    {
        return $this->apply($employee, ['action_type' => 'termination'] + $data, $actor);
    }

    protected function syncPositionVacancy(?int $oldPositionId, ?int $newPositionId): void
    {
        if ($oldPositionId && $oldPositionId !== $newPositionId) {
            Position::where('id', $oldPositionId)->update(['is_vacant' => true]);
        }

        if ($newPositionId) {
            Position::where('id', $newPositionId)->update(['is_vacant' => false]);
        }
    }
}
