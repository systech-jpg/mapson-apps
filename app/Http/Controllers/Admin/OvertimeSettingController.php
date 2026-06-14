<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\OvertimeSetting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class OvertimeSettingController extends Controller
{
    public function edit(): Response
    {
        $s = OvertimeSetting::current();

        return Inertia::render('overtime/settings', [
            'settings' => [
                'rate_per_hour' => (float) $s->rate_per_hour,
                'multiplier_workday' => (float) $s->multiplier_workday,
                'multiplier_holiday' => (float) $s->multiplier_holiday,
            ],
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'rate_per_hour' => ['required', 'numeric', 'min:0'],
            'multiplier_workday' => ['required', 'numeric', 'min:0', 'max:99'],
            'multiplier_holiday' => ['required', 'numeric', 'min:0', 'max:99'],
        ]);

        OvertimeSetting::current()->update($data);

        return back()->with('success', 'Pengaturan tarif lembur disimpan.');
    }
}
