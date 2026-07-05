<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Currency;
use App\Models\PricingProfile;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Finance master data: pricing profiles (default sell/cost %) and currency rates — editable
 * from the UI instead of the seeder.
 */
class PricingSettingController extends Controller
{
    private const PROFILE_FIELDS = [
        'code', 'name', 'rounding_step', 'is_active',
        'default_bm_pct', 'default_pph22_pct', 'default_ppn_pct', 'default_shipment_pct',
        'default_ops_pct', 'default_profit_pct', 'default_komisi_pct', 'default_event_pct', 'default_lainnya_pct', 'default_buffer_pct',
    ];

    // ---- Profiles ----
    public function profiles(): Response
    {
        return Inertia::render('pricing-settings/profiles', [
            'profiles' => PricingProfile::orderBy('sort_order')->get(),
        ]);
    }

    public function saveProfiles(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'profiles' => ['required', 'array', 'min:1'],
            'profiles.*.id' => ['nullable', 'integer'],
            'profiles.*.code' => ['required', 'string', 'max:50'],
            'profiles.*.name' => ['required', 'string', 'max:100'],
            'profiles.*.rounding_step' => ['required', 'integer', 'min:1'],
            'profiles.*.is_active' => ['boolean'],
            'profiles.*.default_bm_pct' => ['numeric'],
            'profiles.*.default_pph22_pct' => ['numeric'],
            'profiles.*.default_ppn_pct' => ['numeric'],
            'profiles.*.default_shipment_pct' => ['numeric'],
            'profiles.*.default_ops_pct' => ['numeric'],
            'profiles.*.default_profit_pct' => ['numeric'],
            'profiles.*.default_komisi_pct' => ['numeric'],
            'profiles.*.default_event_pct' => ['numeric'],
            'profiles.*.default_lainnya_pct' => ['numeric'],
            'profiles.*.default_buffer_pct' => ['numeric'],
        ]);

        foreach ($data['profiles'] as $i => $p) {
            $attrs = Arr::only($p, self::PROFILE_FIELDS) + ['sort_order' => $i + 1];
            if (! empty($p['id'])) {
                PricingProfile::whereKey($p['id'])->update($attrs);
            } else {
                PricingProfile::create($attrs);
            }
        }

        return back()->with('success', 'Profil harga disimpan.');
    }

    // ---- Currencies ----
    public function currencies(): Response
    {
        return Inertia::render('pricing-settings/currencies', [
            'currencies' => Currency::orderBy('code')->get(['code', 'name', 'rate_to_idr']),
        ]);
    }

    public function saveCurrencies(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'currencies' => ['required', 'array', 'min:1'],
            'currencies.*.code' => ['required', 'string', 'max:3'],
            'currencies.*.name' => ['nullable', 'string', 'max:100'],
            'currencies.*.rate_to_idr' => ['required', 'numeric', 'min:0'],
        ]);

        foreach ($data['currencies'] as $c) {
            Currency::updateOrCreate(
                ['code' => strtoupper($c['code'])],
                ['name' => $c['name'] ?? null, 'rate_to_idr' => $c['rate_to_idr']]
            );
        }

        return back()->with('success', 'Mata uang disimpan.');
    }
}
