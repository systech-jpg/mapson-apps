<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\OvertimeEntry;
use App\Models\OvertimePeriod;
use App\Services\Overtime\OvertimeService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class OvertimeApprovalController extends Controller
{
    public function __construct(private OvertimeService $service)
    {
    }

    /** Inbox: periods awaiting my action (supervisor per-row + period, or HR period). */
    public function index(Request $request): Response
    {
        $user = $request->user();
        $empId = optional($user->employee)->id;
        $isHr = $this->service->userIsHr($user);

        $periods = OvertimePeriod::with(['employee:id,full_name,employee_code', 'entries', 'approvals.approver:id,full_name'])
            ->where(function ($q) use ($empId, $isHr) {
                if ($empId) {
                    $q->where(fn ($w) => $w->where('status', OvertimePeriod::STATUS_PENDING_SUPERVISOR)
                        ->whereHas('approvals', fn ($a) => $a->where('role', 'supervisor')
                            ->where('status', 'pending')->where('approver_employee_id', $empId)));
                }
                if ($isHr) {
                    $q->orWhere('status', OvertimePeriod::STATUS_PENDING_HR);
                }
            })
            ->orderBy('submitted_at')
            ->get();

        $periods->each(fn ($p) => $p->setAttribute('can_act', $this->service->canApprove($p, $user)));

        return Inertia::render('overtime/approvals', ['periods' => $periods]);
    }

    public function decideEntry(Request $request, OvertimeEntry $entry): RedirectResponse
    {
        $data = $request->validate(['status' => ['required', 'in:approved,rejected']]);
        abort_unless($this->service->canApprove($entry->period, $request->user()), 403);

        try {
            $this->service->decideEntry($entry, $data['status'], $request->user());
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Baris lembur diperbarui.');
    }

    public function approve(Request $request, OvertimePeriod $overtime): RedirectResponse
    {
        abort_unless($this->service->canApprove($overtime, $request->user()), 403);

        try {
            $this->service->approve($overtime, $request->user(), $request->string('note')->toString() ?: null);
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Lembur disetujui.');
    }

    public function reject(Request $request, OvertimePeriod $overtime): RedirectResponse
    {
        $data = $request->validate(['note' => ['required', 'string', 'max:500']]);
        abort_unless($this->service->canApprove($overtime, $request->user()), 403);

        try {
            $this->service->reject($overtime, $request->user(), $data['note']);
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Lembur ditolak.');
    }
}
