<?php

namespace Database\Seeders;

use App\Models\Currency;
use Illuminate\Database\Seeder;

class CurrencySeeder extends Seeder
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
    }
}
