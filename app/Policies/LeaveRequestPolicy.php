<?php

namespace App\Policies;

use App\Models\LeaveRequest;
use App\Models\User;

class LeaveRequestPolicy
{
    /** Any logged-in user with a linked employee may file leave. */
    public function create(User $user): bool
    {
        return $user->employee !== null;
    }

    public function view(User $user, LeaveRequest $request): bool
    {
        return $this->isOwner($user, $request)
            || $this->isApproverInChain($user, $request)
            || $this->isHr($user)
            || $this->isDirector($user);
    }

    /** Owner can withdraw while the request is still pending. */
    public function withdraw(User $user, LeaveRequest $request): bool
    {
        return $this->isOwner($user, $request) && $request->isPending();
    }

    /** Owner (pending) or HR (approved & not started) can cancel. */
    public function cancel(User $user, LeaveRequest $request): bool
    {
        if ($request->isPending()) {
            return $this->isOwner($user, $request) || $this->isHr($user);
        }

        return $request->status === LeaveRequest::STATUS_APPROVED && $this->isHr($user);
    }

    /** Act on the active approval step (person-based or role-based), never your own request. */
    public function approve(User $user, LeaveRequest $request): bool
    {
        if (! $request->isPending() || $this->isOwner($user, $request)) {
            return false;
        }

        $step = $request->approvals->firstWhere('level', $request->current_level);
        if (! $step || $step->status !== 'pending') {
            return false;
        }

        // Person-based step: must be the assigned approver.
        if ($step->approver_employee_id) {
            return $user->employee?->id === $step->approver_employee_id;
        }

        // Role-based step (hr/director): must hold the matching RBAC role.
        return $this->hasApproverRole($user, $step->role);
    }

    private function isOwner(User $user, LeaveRequest $request): bool
    {
        return $user->employee && $user->employee->id === $request->employee_id;
    }

    private function isApproverInChain(User $user, LeaveRequest $request): bool
    {
        $empId = $user->employee?->id;

        return ($empId && $request->approvals->contains('approver_employee_id', $empId))
            || $this->hasApproverRole($user, 'hr')
            || $this->hasApproverRole($user, 'director');
    }

    private function isHr(User $user): bool
    {
        return $this->hasApproverRole($user, 'hr');
    }

    private function isDirector(User $user): bool
    {
        return $this->hasApproverRole($user, 'director');
    }

    private function hasApproverRole(User $user, string $role): bool
    {
        $slugs = config("leave.approver_roles.{$role}", []);

        return in_array($user->role?->slug, $slugs, true);
    }
}
