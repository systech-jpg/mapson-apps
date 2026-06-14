<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AttendanceSetting;
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
                'multiplier_holiday' => (float) $ot->multiplier_holiday,
            ],
            'leaveTypes' => LeaveType::orderBy('sort_order')->get(),
            'holidayYear' => $year,
            'holidays' => LeaveHoliday::whereYear('date', $year)->orderBy('date')->get(),
        ]);
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
