<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AttendanceSetting;
use App\Models\AttendCaseFee;
use App\Models\LeaveHoliday;
use App\Models\LeaveType;
use App\Models\OvertimeSetting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * One consolidated "Pengaturan Kepegawaian" page: attendance rules, overtime rate,
 * leave types, and holidays. Mutations reuse the existing resource controllers
 * (re-gated under the single `hr-settings` permission).
 */
class HrSettingController extends Controller
{
    public function index(Request $request): Response
    {
        $year = $request->integer('year') ?: (int) now()->year;
        $att = AttendanceSetting::current();
        $ot = OvertimeSetting::current();

        return Inertia::render('settings/index', [
            'attendance' => [
                'deadline' => $att->deadline,
                'full_day_after' => $att->full_day_after,
            ],
            'overtime' => [
                'rate_per_hour' => (float) $ot->rate_per_hour,
                'multiplier_workday' => (float) $ot->multiplier_workday,
                'holiday_flat_rate' => (float) $ot->holiday_flat_rate,
            ],
            'leaveTypes' => LeaveType::orderBy('sort_order')->get(),
            'holidayYear' => $year,
            'holidays' => LeaveHoliday::whereYear('date', $year)->orderBy('date')->get(),
            'attendTiers' => AttendCaseFee::orderBy('sort_order')->orderBy('tier')->get(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function tierRules(?int $id = null): array
    {
        return [
            'tier' => ['required', 'integer', 'min:1', 'max:255', \Illuminate\Validation\Rule::unique('attend_case_fees', 'tier')->ignore($id)],
            'label' => ['required', 'string', 'max:255'],
            'fee_workday' => ['required', 'numeric', 'min:0'],
            'fee_holiday' => ['required', 'numeric', 'min:0'],
            'basis' => ['required', 'in:tindakan,invoice'],
            'is_active' => ['boolean'],
        ];
    }

    public function storeAttendTier(Request $request): RedirectResponse
    {
        $data = $request->validate($this->tierRules());
        AttendCaseFee::create($data + ['sort_order' => $data['tier']]);

        return back()->with('success', 'Tier attend case ditambahkan.');
    }

    public function updateAttendTier(Request $request, AttendCaseFee $tier): RedirectResponse
    {
        $data = $request->validate($this->tierRules($tier->id));
        $tier->update($data + ['sort_order' => $data['tier']]);

        return back()->with('success', 'Tier attend case diperbarui.');
    }

    public function destroyAttendTier(AttendCaseFee $tier): RedirectResponse
    {
        $tier->delete();

        return back()->with('success', 'Tier attend case dihapus.');
    }

    public function updateAttendance(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'deadline' => ['required', 'date_format:H:i'],
            'full_day_after' => ['required', 'date_format:H:i'],
        ]);

        AttendanceSetting::current()->update($data);

        return back()->with('success', 'Pengaturan absensi disimpan.');
    }
}
