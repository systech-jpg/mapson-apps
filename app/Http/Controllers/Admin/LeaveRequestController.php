<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreLeaveRequestRequest;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Services\Leave\LeaveBalanceService;
use App\Services\Leave\LeaveRequestService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class LeaveRequestController extends Controller
{
    public function __construct(
        private LeaveRequestService $service,
        private LeaveBalanceService $balances,
    ) {
    }

    /** "Cuti Saya": daftar pengajuan + saldo tahun berjalan. */
    public function index(): Response
    {
        $employee = request()->user()->employee;
        $year = (int) now()->year;

        $requests = $employee
            ? LeaveRequest::with('leaveType:id,name,code')
                ->where('employee_id', $employee->id)
                ->orderByDesc('created_at')->paginate(15)
            : null;

        $balances = $employee
            ? LeaveType::where('is_active', true)->where('requires_balance', true)->orderBy('sort_order')->get()
                ->map(fn ($t) => [
                    'code' => $t->code, 'name' => $t->name,
                    'available' => $this->balances->available($employee->id, $t->id, $year),
                ])
            : [];

        return Inertia::render('leave/index', [
            'employeeLinked' => (bool) $employee,
            'requests' => $requests,
            'balances' => $balances,
            'year' => $year,
            'leaveTypes' => LeaveType::where('is_active', true)->orderBy('sort_order')
                ->get(['id', 'code', 'name', 'unit', 'requires_attachment', 'allow_half_day', 'gender_constraint']),
        ]);
    }

    public function store(StoreLeaveRequestRequest $request): RedirectResponse
    {
        $employee = $request->user()->employee;
        if (! $employee) {
            return back()->with('error', 'Akun Anda belum tertaut ke data karyawan.');
        }

        $type = LeaveType::findOrFail($request->integer('leave_type_id'));
        if ($type->requires_attachment && ! $request->hasFile('attachments')) {
            return back()->with('error', "Jenis cuti \"{$type->name}\" wajib melampirkan dokumen.");
        }

        try {
            $leave = $this->service->submit($employee, $request->validated(), $request->user());

            foreach ((array) $request->file('attachments', []) as $file) {
                $leave->attachments()->create([
                    'original_name' => $file->getClientOriginalName(),
                    'path' => $file->store("leave/{$leave->id}", 'local'),
                    'mime' => $file->getMimeType(),
                    'size' => $file->getSize(),
                    'uploaded_by' => $request->user()->id,
                ]);
            }
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return to_route('leave.index')->with('success', "Pengajuan {$leave->request_number} terkirim.");
    }

    public function show(LeaveRequest $leave): Response
    {
        $this->authorize('view', $leave);

        $leave->load([
            'leaveType', 'employee:id,full_name,employee_code',
            'approvals.approver:id,full_name', 'attachments', 'creator:id,name',
        ]);

        return Inertia::render('leave/show', ['leave' => $leave]);
    }

    public function withdraw(LeaveRequest $leave): RedirectResponse
    {
        $this->authorize('withdraw', $leave);

        try {
            $this->service->withdraw($leave);
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Pengajuan ditarik.');
    }

    public function cancel(LeaveRequest $leave): RedirectResponse
    {
        $this->authorize('cancel', $leave);

        try {
            $this->service->cancel($leave, request('note'));
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Pengajuan dibatalkan.');
    }

    public function downloadAttachment(LeaveRequest $leave, int $attachment): StreamedResponse
    {
        $this->authorize('view', $leave);
        $att = $leave->attachments()->findOrFail($attachment);
        abort_unless(Storage::disk('local')->exists($att->path), 404);

        return Storage::disk('local')->download($att->path, $att->original_name);
    }
}
