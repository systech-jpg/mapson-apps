<?php

namespace App\Services\Overtime;

use App\Models\Employee;
use App\Models\OvertimePeriod;
use App\Models\User;
use App\Notifications\OvertimeDecisionNotification;
use App\Notifications\OvertimePendingApprovalNotification;
use Illuminate\Support\Facades\Notification;

class OvertimeNotificationService
{
    /** Notify whoever owns the period's currently-active approval step. */
    public function notifyPendingApprovers(OvertimePeriod $overtime): void
    {
        $overtime->loadMissing('approvals', 'employee');
        $step = $overtime->approvals->firstWhere('level', $overtime->current_level);
        if (! $step) {
            return;
        }

        $users = $step->approver_employee_id
            ? collect([Employee::find($step->approver_employee_id)?->user])->filter()
            : $this->usersWithApproverRole($step->role);

        if ($users->isNotEmpty()) {
            Notification::send($users, new OvertimePendingApprovalNotification($overtime));
        }
    }

    /** Notify the requester of the final outcome. */
    public function notifyRequester(OvertimePeriod $overtime, string $outcome): void
    {
        $overtime->loadMissing('employee.user');
        $user = $overtime->employee?->user;
        if ($user) {
            $user->notify(new OvertimeDecisionNotification($overtime, $outcome));
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
