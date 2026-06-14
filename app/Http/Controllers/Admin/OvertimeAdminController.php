<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\OvertimePeriod;
use App\Services\Overtime\OvertimeService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class OvertimeAdminController extends Controller
{
    public function __construct(private OvertimeService $service)
    {
    }

    /** "Pengajuan Lembur" — HR monitoring of all employees' overtime periods. */
    public function index(Request $request): Response
    {
        $status = $request->string('status')->toString();
        $period = $request->string('period')->toString();
        $search = trim((string) $request->input('search', ''));

        $periods = OvertimePeriod::query()
            ->with(['employee:id,full_name,employee_code'])
            ->when($status, fn ($q) => $q->where('status', $status))
            ->when($period, fn ($q) => $q->where('period', $period))
            ->when($search !== '', fn ($q) => $q->whereHas('employee', fn ($w) => $w
                ->where('full_name', 'like', "%{$search}%")->orWhere('employee_code', 'like', "%{$search}%")))
            ->orderByDesc('period')
            ->orderByDesc('submitted_at')
            ->paginate(20)
            ->withQueryString();

        return Inertia::render('overtime/admin', [
            'periods' => $periods,
            'filters' => ['status' => $status, 'period' => $period, 'search' => $search],
            'statuses' => [
                OvertimePeriod::STATUS_DRAFT, OvertimePeriod::STATUS_PENDING_SUPERVISOR, OvertimePeriod::STATUS_PENDING_HR,
                OvertimePeriod::STATUS_APPROVED, OvertimePeriod::STATUS_REJECTED,
            ],
        ]);
    }

    public function show(Request $request, OvertimePeriod $overtime): Response
    {
        $overtime->load(['employee:id,full_name,employee_code', 'entries', 'approvals.approver:id,full_name']);
        $overtime->setAttribute('can_act', $this->service->canApprove($overtime, $request->user()));

        return Inertia::render('overtime/show', ['overtime' => $overtime]);
    }
}
