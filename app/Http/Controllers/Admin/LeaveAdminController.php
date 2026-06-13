<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Services\Leave\LeaveRequestService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class LeaveAdminController extends Controller
{
    public function __construct(private LeaveRequestService $service)
    {
    }

    /** "Semua Pengajuan" — monitoring HR untuk seluruh karyawan. */
    public function index(Request $request): Response
    {
        $status = $request->string('status')->toString();
        $typeId = $request->integer('type_id') ?: null;
        $search = trim((string) $request->input('search', ''));
        $from = $request->date('from')?->toDateString();
        $to = $request->date('to')?->toDateString();

        $requests = LeaveRequest::query()
            ->with(['leaveType:id,name,code', 'employee:id,full_name,employee_code'])
            ->when($status, fn ($q) => $q->where('status', $status))
            ->when($typeId, fn ($q) => $q->where('leave_type_id', $typeId))
            ->when($search !== '', fn ($q) => $q->whereHas('employee', fn ($w) => $w
                ->where('full_name', 'like', "%{$search}%")->orWhere('employee_code', 'like', "%{$search}%")))
            ->when($from, fn ($q) => $q->where('end_date', '>=', $from))
            ->when($to, fn ($q) => $q->where('start_date', '<=', $to))
            ->orderByDesc('created_at')
            ->paginate(20)
            ->withQueryString();

        return Inertia::render('leave/admin/requests', [
            'requests' => $requests,
            'filters' => ['status' => $status, 'type_id' => $typeId, 'search' => $search, 'from' => $from, 'to' => $to],
            'leaveTypes' => LeaveType::orderBy('sort_order')->get(['id', 'name']),
            'statuses' => array_merge(LeaveRequest::PENDING_STATUSES, [
                LeaveRequest::STATUS_APPROVED, LeaveRequest::STATUS_REJECTED,
                LeaveRequest::STATUS_WITHDRAWN, LeaveRequest::STATUS_CANCELLED, LeaveRequest::STATUS_EXPIRED,
            ]),
        ]);
    }

    /** HR override cancel. */
    public function cancel(Request $request, LeaveRequest $leave): RedirectResponse
    {
        try {
            $this->service->cancel($leave, $request->string('note')->toString() ?: 'Dibatalkan HR');
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Pengajuan dibatalkan.');
    }
}
