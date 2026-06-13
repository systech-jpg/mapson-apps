<?php

namespace App\Services\Leave;

use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\User;
use App\Notifications\LeaveDecisionNotification;
use App\Notifications\LeavePendingApprovalNotification;
use Illuminate\Support\Facades\Notification;

class LeaveNotificationService
{
    /** Notify whoever owns the request's currently-active approval step. */
    public function notifyPendingApprovers(LeaveRequest $leave): void
    {
        $leave->loadMissing('approvals', 'employee', 'leaveType');
        $step = $leave->approvals->firstWhere('level', $leave->current_level);
        if (! $step) {
            return;
        }

        $users = $step->approver_employee_id
            ? collect([Employee::find($step->approver_employee_id)?->user])->filter()
            : $this->usersWithApproverRole($step->role);

        if ($users->isNotEmpty()) {
            Notification::send($users, new LeavePendingApprovalNotification($leave));
        }
    }

    /** Notify the requester of the final outcome. */
    public function notifyRequester(LeaveRequest $leave, string $outcome): void
    {
        $leave->loadMissing('employee.user', 'leaveType');
        $user = $leave->employee?->user;
        if ($user) {
            $user->notify(new LeaveDecisionNotification($leave, $outcome));
        }
    }

    /** @return \Illuminate\Support\Collection<int, User> */
    private function usersWithApproverRole(string $role)
    {
        $slugs = config("leave.approver_roles.{$role}", []);
        if (! $slugs) {
            return collect();
        }

        return User::whereHas('role', fn ($q) => $q->whereIn('slug', $slugs))->get();
    }
}
