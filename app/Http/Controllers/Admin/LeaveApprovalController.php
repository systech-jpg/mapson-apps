<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\LeaveRequest;
use App\Services\Leave\LeaveRequestService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class LeaveApprovalController extends Controller
{
    public function __construct(private LeaveRequestService $service)
    {
    }

    /** "Persetujuan Cuti": antrian pengajuan yang menunggu keputusan saya. */
    public function index(Request $request): Response
    {
        $user = $request->user();
        $empId = $user->employee?->id;
        $roleSlugs = [];
        foreach (['hr', 'director'] as $r) {
            if (in_array($user->role?->slug, config("leave.approver_roles.{$r}", []), true)) {
                $roleSlugs[] = $r;
            }
        }

        $pending = LeaveRequest::with(['leaveType:id,name,code', 'employee:id,full_name,employee_code'])
            ->whereIn('status', LeaveRequest::PENDING_STATUSES)
            ->whereHas('approvals', function ($q) use ($empId, $roleSlugs) {
                $q->whereColumn('level', 'leave_requests.current_level')->where('status', 'pending')
                    ->where(function ($w) use ($empId, $roleSlugs) {
                        if ($empId) {
                            $w->where('approver_employee_id', $empId);
                        }
                        if ($roleSlugs) {
                            $w->orWhere(fn ($r) => $r->whereNull('approver_employee_id')->whereIn('role', $roleSlugs));
                        }
                    });
            })
            ->orderBy('submitted_at')
            ->paginate(15);

        return Inertia::render('leave/approvals', [
            'pending' => $pending,
            'canActAsRole' => $roleSlugs,
        ]);
    }

    public function approve(Request $request, LeaveRequest $leave): RedirectResponse
    {
        $this->authorize('approve', $leave);

        try {
            $this->service->approve($leave, $request->user()->employee, $request->string('note')->toString() ?: null);
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Pengajuan disetujui.');
    }

    public function reject(Request $request, LeaveRequest $leave): RedirectResponse
    {
        $this->authorize('approve', $leave);
        $request->validate(['note' => ['required', 'string', 'max:1000']]);

        try {
            $this->service->reject($leave, $request->user()->employee, $request->string('note')->toString());
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Pengajuan ditolak.');
    }
}
