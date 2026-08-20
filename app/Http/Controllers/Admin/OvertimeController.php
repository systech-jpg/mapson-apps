<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreOvertimeEntryRequest;
use App\Models\OvertimeEntry;
use App\Models\OvertimePeriod;
use App\Models\OvertimeSetting;
use App\Services\Overtime\OvertimeService;
use App\Support\AttendancePeriod;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Carbon;
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
                'holiday_flat_rate' => (float) $settings->holiday_flat_rate,
            ],
        ]);
    }

    public function storeEntry(StoreOvertimeEntryRequest $request): RedirectResponse
    {
        $employee = $request->user()?->employee;
        abort_unless($employee, 403, 'Akun belum tertaut ke karyawan.');

        // Periode ditentukan dari TANGGAL entri, bukan periode yang sedang dibuka —
        // backdate ke periode sebelumnya (maks 30 hari) otomatis masuk ke periode yang benar.
        $periodKey = AttendancePeriod::keyFor(Carbon::parse($request->input('date')));

        try {
            $period = $this->service->openPeriod($employee, $periodKey, $request->user());
            $this->service->addEntry($period, $request->validated());
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        if ($periodKey !== $request->input('period')) {
            return to_route('overtime.index', ['period' => $periodKey])
                ->with('success', 'Entri lembur ditambahkan ke periode '.AttendancePeriod::label($period->period_start, $period->period_end).'.');
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

    public function backToDraft(Request $request, OvertimePeriod $overtime): RedirectResponse
    {
        $this->authorizeOwner($request, $overtime);

        try {
            $this->service->backToDraft($overtime);
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Lembur dikembalikan ke draf untuk direvisi.');
    }

    private function authorizeOwner(Request $request, OvertimePeriod $period): void
    {
        abort_unless($period->employee_id === optional($request->user()->employee)->id, 403);
    }

    /** Printable PDF of one overtime period (owner or HR/admin), with the 3-way approval block. */
    public function pdf(Request $request, OvertimePeriod $overtime): \Symfony\Component\HttpFoundation\Response
    {
        $user = $request->user();
        $isOwner = $overtime->employee_id === optional($user->employee)->id;
        $canManage = $user->hasMenuAccess('overtime-approvals', 'view') || $user->hasMenuAccess('overtime-admin', 'view');
        abort_unless($isOwner || $canManage, 403);

        $overtime->load(['employee:id,full_name,employee_code,current_position_id', 'employee.currentPosition:id,name', 'entries']);

        $logoPath = public_path('images/logo.png');
        $logo = is_file($logoPath) ? 'data:image/png;base64,'.base64_encode((string) file_get_contents($logoPath)) : null;

        $pdf = Pdf::loadView('reports.overtime', [
            'ot' => $overtime,
            'logo' => $logo,
            'periodLabel' => AttendancePeriod::label($overtime->period_start, $overtime->period_end),
            'signers' => [
                ['role' => 'HR', 'name' => 'Marisa Syarifah'],
                ['role' => 'Finance', 'name' => 'Dian Tika Mardhan'],
                ['role' => 'Operation', 'name' => 'Mohammad Ridhuan'],
            ],
        ])->setPaper('a4', 'portrait');

        return $pdf->download('lembur-'.$overtime->request_number.'.pdf');
    }
}
