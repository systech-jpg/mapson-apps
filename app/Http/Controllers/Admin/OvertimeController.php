<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreOvertimeEntryRequest;
use App\Models\OvertimeEntry;
use App\Models\OvertimePeriod;
use App\Models\OvertimeSetting;
use App\Services\Overtime\OvertimeService;
use App\Support\AttendancePeriod;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class OvertimeController extends Controller
{
    public function __construct(private OvertimeService $service)
    {
    }

    /** "Lembur Saya" — the current user's overtime for a period (header + entries). */
    public function index(Request $request): Response
    {
        $employee = $request->user()?->employee;
        [$period, $from, $to] = AttendancePeriod::resolve($request->input('period'));

        $current = $employee
            ? OvertimePeriod::with(['entries', 'approvals.approver:id,full_name'])
                ->where('employee_id', $employee->id)->where('period', $period)->first()
            : null;

        $settings = OvertimeSetting::current();

        return Inertia::render('overtime/index', [
            'employeeLinked' => (bool) $employee,
            'period' => $period,
            'periodLabel' => AttendancePeriod::label($from, $to),
            'periodStart' => $from->toDateString(),
            'periodEnd' => $to->toDateString(),
            'overtime' => $current,
            'periods' => $employee
                ? OvertimePeriod::where('employee_id', $employee->id)->orderByDesc('period')->limit(12)
                    ->get(['id', 'period', 'status', 'total_hours', 'total_amount'])
                : [],
            'settings' => [
                'rate_per_hour' => (float) $settings->rate_per_hour,
                'multiplier_workday' => (float) $settings->multiplier_workday,
                'multiplier_holiday' => (float) $settings->multiplier_holiday,
            ],
        ]);
    }

    public function storeEntry(StoreOvertimeEntryRequest $request): RedirectResponse
    {
        $employee = $request->user()?->employee;
        abort_unless($employee, 403, 'Akun belum tertaut ke karyawan.');

        try {
            $period = $this->service->openPeriod($employee, $request->input('period'), $request->user());
            $this->service->addEntry($period, $request->validated());
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Entri lembur ditambahkan.');
    }

    public function updateEntry(StoreOvertimeEntryRequest $request, OvertimeEntry $entry): RedirectResponse
    {
        $this->authorizeOwner($request, $entry->period);

        try {
            $this->service->updateEntry($entry, $request->validated());
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Entri lembur diperbarui.');
    }

    public function destroyEntry(Request $request, OvertimeEntry $entry): RedirectResponse
    {
        $this->authorizeOwner($request, $entry->period);

        try {
            $this->service->deleteEntry($entry);
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Entri lembur dihapus.');
    }

    public function submit(Request $request, OvertimePeriod $overtime): RedirectResponse
    {
        $this->authorizeOwner($request, $overtime);

        try {
            $this->service->submit($overtime);
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Lembur periode ini diajukan untuk persetujuan.');
    }

    private function authorizeOwner(Request $request, OvertimePeriod $period): void
    {
        abort_unless($period->employee_id === optional($request->user()->employee)->id, 403);
    }
}
