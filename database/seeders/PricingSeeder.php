<?php

namespace Database\Seeders;

use App\Models\Currency;
use App\Models\PricingParameter;
use App\Models\Product;
use Illuminate\Database\Seeder;

class PricingSeeder extends Seeder
{
    public function run(): void
    {
        foreach ([
            ['code' => 'IDR', 'name' => 'Rupiah', 'rate_to_idr' => 1],
            ['code' => 'USD', 'name' => 'US Dollar', 'rate_to_idr' => 16200],
            ['code' => 'EUR', 'name' => 'Euro', 'rate_to_idr' => 17500],
            ['code' => 'SGD', 'name' => 'Singapore Dollar', 'rate_to_idr' => 12000],
            ['code' => 'JPY', 'name' => 'Japanese Yen', 'rate_to_idr' => 108],
        ] as $c) {
            Currency::updateOrCreate(['code' => $c['code']], $c);
        }

        foreach ([
            ['name' => 'Standard Pricelist RS', 'sort_order' => 1],
            ['name' => 'Project Tender', 'sort_order' => 2],
            ['name' => 'Distributor', 'sort_order' => 3],
        ] as $p) {
            PricingParameter::firstOrCreate(['name' => $p['name']], $p);
        }

        // Sample products (manual until ERP catalog sync).
        $samples = [
            ['sku_code' => 'IMP-PEDICLE-01', 'product_name' => 'Pedicle Screw System', 'principal_name' => 'Medtronic', 'currency_code' => 'USD', 'base_price_valas' => 1200, 'principal_disc_pct' => 35, 'bm_nominal' => 500000, 'tax_nominal' => 1900000, 'import_fee_nominal' => 250000, 'opex_pct' => 8, 'profit_pct' => 25, 'comm_pct' => 10, 'ship_sales_pct' => 2],
            ['sku_code' => 'IMP-CAGE-MIS', 'product_name' => 'MIS Interbody Cage', 'principal_name' => 'Stryker', 'currency_code' => 'EUR', 'base_price_valas' => 900, 'principal_disc_pct' => 40, 'bm_nominal' => 400000, 'tax_nominal' => 1700000, 'import_fee_nominal' => 200000, 'opex_pct' => 8, 'profit_pct' => 22, 'comm_pct' => 8, 'ship_sales_pct' => 2],
            ['sku_code' => 'BONE-CEMENT-40', 'product_name' => 'Bone Cement 40g', 'principal_name' => 'Heraeus', 'currency_code' => 'EUR', 'base_price_valas' => 180, 'principal_disc_pct' => 30, 'bm_nominal' => 100000, 'tax_nominal' => 350000, 'import_fee_nominal' => 80000, 'opex_pct' => 10, 'profit_pct' => 20, 'comm_pct' => 5, 'ship_sales_pct' => 1.5],
            ['sku_code' => 'NAV-PROBE-02', 'product_name' => 'Navigation Probe', 'principal_name' => 'Brainlab', 'currency_code' => 'USD', 'base_price_valas' => 2500, 'principal_disc_pct' => 28, 'bm_nominal' => 800000, 'tax_nominal' => 4200000, 'import_fee_nominal' => 350000, 'opex_pct' => 9, 'profit_pct' => 30, 'comm_pct' => 12, 'ship_sales_pct' => 2.5],
        ];
        foreach ($samples as $s) {
            Product::firstOrCreate(['sku_code' => $s['sku_code']], $s);
        }
    }
}
