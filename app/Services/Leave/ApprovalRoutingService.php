<?php

namespace App\Services\Leave;

use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\OrgUnit;

class ApprovalRoutingService
{
    /**
     * Build the ordered approval steps for a request from the configured flow +
     * the employee's reporting chain. supervisor/manager are person-based and
     * skipped when unresolved or equal to the requester; hr/director are
     * role-based (approver_employee_id = null → any role holder acts).
     *
     * @return array<int, array{level: int, role: string, approver_employee_id: int|null}>
     */
    public function buildSteps(LeaveRequest $request): array
    {
        $employee = $request->employee;
        $code = $request->leaveType->code;
        $days = (float) $request->total_days;

        $flow = config("leave.approval_flow.{$code}", config('leave.approval_flow.default'));

        $steps = [];
        $level = 0;
        $usedApprovers = [];

        foreach ($flow as $rule) {
            if (($rule['min_days'] ?? 0) > $days) {
                continue; // level tidak diperlukan untuk durasi ini
            }

            $role = $rule['role'];
            $personBased = in_array($role, ['supervisor', 'manager'], true);
            $approverId = match ($role) {
                'supervisor' => $employee->reports_to_employee_id,
                'manager' => $this->resolveManager($employee),
                default => null,
            };

            if ($personBased) {
                // Anti self-approval + skip jika tak ada approver + dedup berurutan.
                if (! $approverId || $approverId === $employee->id || in_array($approverId, $usedApprovers, true)) {
                    continue;
                }
                $usedApprovers[] = $approverId;
            }

            $steps[] = ['level' => ++$level, 'role' => $role, 'approver_employee_id' => $approverId];
        }

        // Jaring pengaman: minimal satu langkah (HR).
        if ($steps === []) {
            $steps[] = ['level' => 1, 'role' => 'hr', 'approver_employee_id' => null];
        }

        return $steps;
    }

    /** Manager = manager unit organisasi; fallback ke atasan-nya atasan. */
    private function resolveManager(Employee $employee): ?int
    {
        if ($employee->current_org_unit_id) {
            $managerId = OrgUnit::whereKey($employee->current_org_unit_id)->value('manager_employee_id');
            if ($managerId) {
                return (int) $managerId;
            }
        }

        if ($employee->reports_to_employee_id) {
            return Employee::whereKey($employee->reports_to_employee_id)->value('reports_to_employee_id');
        }

        return null;
    }
}
