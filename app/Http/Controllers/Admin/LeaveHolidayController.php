<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\LeaveHoliday;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class LeaveHolidayController extends Controller
{
    public function index(Request $request): Response
    {
        $year = $request->integer('year') ?: (int) now()->year;

        return Inertia::render('leave/admin/holidays', [
            'year' => $year,
            'holidays' => LeaveHoliday::whereYear('date', $year)->orderBy('date')->get(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        LeaveHoliday::create($this->validated($request));

        return back()->with('success', 'Hari libur ditambahkan.');
    }

    public function update(Request $request, LeaveHoliday $leave_holiday): RedirectResponse
    {
        $leave_holiday->update($this->validated($request, $leave_holiday->id));

        return back()->with('success', 'Hari libur diperbarui.');
    }

    public function destroy(LeaveHoliday $leave_holiday): RedirectResponse
    {
        $leave_holiday->delete();

        return back()->with('success', 'Hari libur dihapus.');
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?int $id = null): array
    {
        return $request->validate([
            'date' => ['required', 'date', Rule::unique('leave_holidays', 'date')->ignore($id)],
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', 'in:national,collective,company'],
            'is_workday_override' => ['boolean'],
        ]);
    }
}
