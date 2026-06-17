<?php

namespace App\Support;

/**
 * Sequential waterfall pricing engine. Mirrors resources/js/lib/pricing.ts exactly so
 * the frontend live preview and the backend validated value always agree.
 */
class PricingCalculator
{
    /**
     * @param  array<string, mixed>  $i  input modifiers
     * @param  float  $rate  currency rate to IDR
     * @return array<string, float>
     */
    public static function compute(array $i, float $rate): array
    {
        $f = fn ($k) => (float) ($i[$k] ?? 0);

        $cifIdr = ($f('base_price_valas') * $rate) * (1 - $f('principal_disc_pct') / 100);
        $warehouse = $cifIdr + $f('bm_nominal') + $f('tax_nominal') + $f('import_fee_nominal');
        $operating = $warehouse + ($warehouse * $f('opex_pct') / 100);

        $profit = $f('profit_pct');
        $bottom = $profit >= 100 ? $operating : $operating / (1 - $profit / 100);

        $comm = $f('comm_pct');
        $rawFinal = $comm >= 100 ? $bottom : $bottom / (1 - $comm / 100);

        $finalPricelist = round($rawFinal / 1000) * 1000;
        $deducted = $finalPricelist - ($finalPricelist * $f('ship_sales_pct') / 100);

        return [
            'cif_idr' => round($cifIdr, 2),
            'warehouse' => round($warehouse, 2),
            'operating' => round($operating, 2),
            'bottom' => round($bottom, 2),
            'raw_final' => round($rawFinal, 2),
            'final_pricelist' => round($finalPricelist, 2),
            'deducted' => round($deducted, 2),
        ];
    }
}
