<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\LeaveRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Personal self-service dashboard (Beranda) for any logged-in employee: profile,
 * leave balances/usage, and recent leave & overtime — distinct from the reporting
 * (sales analytics) dashboard. RBAC-gated via the `my-dashboard` menu key.
 */
class MyDashboardController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $employee = $user->employee()->with([
            'currentPosition:id,name', 'currentOrgUnit:id,name', 'currentCompany:id,name', 'currentEmployeeGroup:id,name',
        ])->first();
        $year = (int) now()->year;

        if (! $employee) {
            return Inertia::render('dashboard/me', [
                'employeeLinked' => false,
                'year' => $year,
            ]);
        }

        $balances = $employee->leaveBalances()->with('leaveType:id,code,name')->where('year', $year)->get()
            ->map(fn ($b) => [
                'code' => $b->leaveType?->code,
                'name' => $b->leaveType?->name,
                'allotted' => (float) $b->allotted + (float) $b->carried_over + (float) $b->adjustment,
                'used' => (float) $b->used,
                'pending' => (float) $b->pending,
                'available' => (float) $b->available,
            ])->values();

        $annual = $balances->firstWhere('code', 'ANNUAL');

        $recentLeave = $employee->leaveRequests()->with('leaveType:id,name')->latest('start_date')->limit(5)->get()
            ->map(fn ($r) => [
                'id' => $r->id,
                'request_number' => $r->request_number,
                'type' => $r->leaveType?->name,
                'start_date' => $r->start_date,
                'end_date' => $r->end_date,
                'total_days' => $r->total_days,
                'status' => $r->status,
            ]);

        $recentOvertime = $employee->overtimePeriods()->latest('period')->limit(5)->get()
            ->map(fn ($p) => [
                'id' => $p->id,
                'request_number' => $p->request_number,
                'period' => $p->period,
                'status' => $p->status,
                'total_hours' => $p->total_hours,
                'total_amount' => $p->total_amount,
            ]);

        // Dashboard variant is driven by the employee's Employee Group (e.g. group
        // "Sales" → variant "sales"). Unknown variants fall back to the general view.
        $group = $employee->currentEmployeeGroup;

        return Inertia::render('dashboard/me', [
            'employeeLinked' => true,
            'year' => $year,
            'variant' => $group ? Str::slug($group->name) : 'general',
            'employeeGroup' => $group?->name,
            'profile' => [
                'full_name' => $employee->full_name,
                'employee_code' => $employee->employee_code,
                'position' => $employee->currentPosition?->name,
                'org_unit' => $employee->currentOrgUnit?->name,
                'company' => $employee->currentCompany?->name,
                'email' => $user->email,
                'hire_date' => $employee->hire_date?->toDateString(),
                'status' => $employee->current_employment_status,
                'has_photo' => (bool) $employee->photo_path,
            ],
            'annual' => $annual ? ['taken' => $annual['used'], 'remaining' => $annual['available'], 'allotted' => $annual['allotted']] : null,
            'balances' => $balances,
            'recentLeave' => $recentLeave,
            'recentOvertime' => $recentOvertime,
            'pendingMine' => [
                'leave' => $employee->leaveRequests()->whereIn('status', LeaveRequest::PENDING_STATUSES)->count(),
                'overtime' => $employee->overtimePeriods()->whereIn('status', ['pending_supervisor', 'pending_hr'])->count(),
            ],
            'approvals' => $this->approvalCounts($user, $employee->id),
        ]);
    }

    /** Stream the logged-in user's own employee photo (no Employee-menu permission needed). */
    public function photo(Request $request): StreamedResponse
    {
        $employee = $request->user()->employee;
        abort_unless($employee && $employee->photo_path && Storage::disk('local')->exists($employee->photo_path), 404);

        return Storage::disk('local')->response($employee->photo_path);
    }

    /**
     * Pending approvals awaiting THIS user (supervisor person-based or HR role-based).
     *
     * @return array{leave:int, overtime:int}
     */
    private function approvalCounts(\App\Models\User $user, int $employeeId): array
    {
        $isHr = in_array(optional($user->role)->slug, (array) config('leave.approver_roles.hr', ['hr-admin']), true);

        $leave = DB::table('leave_requests as lr')
            ->join('leave_approvals as la', 'la.leave_request_id', '=', 'lr.id')
            ->whereColumn('la.level', 'lr.current_level')
            ->where('la.status', 'pending')
            ->where(function ($q) use ($employeeId, $isHr) {
                $q->where('la.approver_employee_id', $employeeId);
                if ($isHr) {
                    $q->orWhere('lr.status', 'pending_hr');
                }
            })
            ->distinct()->count('lr.id');

        $overtime = DB::table('overtime_periods as op')
            ->join('overtime_approvals as oa', 'oa.overtime_period_id', '=', 'op.id')
            ->whereColumn('oa.level', 'op.current_level')
            ->where('oa.status', 'pending')
            ->where(function ($q) use ($employeeId, $isHr) {
                $q->where('oa.approver_employee_id', $employeeId);
                if ($isHr) {
                    $q->orWhere('op.status', 'pending_hr');
                }
            })
            ->distinct()->count('op.id');

        return ['leave' => $leave, 'overtime' => $overtime];
    }
}
