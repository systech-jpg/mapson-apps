<?php

namespace Database\Seeders;

use App\Models\PricingProfile;
use Illuminate\Database\Seeder;

/**
 * Default pricing profiles. Cost rates (import side) are the same across profiles;
 * profiles differ mainly in sell-side margin/allocation. Values are starting defaults —
 * finance can adjust them in the app.
 */
class PricingProfileSeeder extends Seeder
{
    public function run(): void
    {
        $costs = [
            'default_bm_pct' => 5,
            'default_pph22_pct' => 2.5,
            'default_ppn_pct' => 11,
            'default_shipment_pct' => 10,
            'rounding_step' => 1000,
        ];

        $profiles = [
            ['code' => 'nasional', 'name' => 'Harga Nasional', 'sort_order' => 1,
                'default_ops_pct' => 34, 'default_profit_pct' => 30, 'default_komisi_pct' => 0, 'default_event_pct' => 0, 'default_lainnya_pct' => 0, 'default_buffer_pct' => 0],
            ['code' => 'e-catalogue', 'name' => 'Harga E-Catalogue', 'sort_order' => 2,
                'default_ops_pct' => 34, 'default_profit_pct' => 30, 'default_komisi_pct' => 5, 'default_event_pct' => 5, 'default_lainnya_pct' => 0, 'default_buffer_pct' => 10],
            ['code' => 'subdist', 'name' => 'Harga Subdist', 'sort_order' => 3,
                'default_ops_pct' => 34, 'default_profit_pct' => 20, 'default_komisi_pct' => 10, 'default_event_pct' => 0, 'default_lainnya_pct' => 0, 'default_buffer_pct' => 15],
        ];

        foreach ($profiles as $p) {
            PricingProfile::updateOrCreate(['code' => $p['code']], $p + $costs);
        }
    }
}
