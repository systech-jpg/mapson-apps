<?php

namespace App\Support;

/**
 * Profile-based waterfall pricing engine. Mirrors resources/js/lib/pricing-engine.ts
 * exactly so the editable grid's live preview and the backend-validated value agree.
 *
 * Cost bases (Indonesian import structure):
 *   A  Pricelist Principal IDR = kurs × (price_principle × (1 - disc%))
 *   BM       = A × bm%
 *   PPh22    = (A + BM) × pph22%      (on nilai impor)
 *   PPN      = (A + BM) × ppn%        (on nilai impor)
 *   Shipment = A × shipment%
 *   B  Total Cost      = BM + PPh22 + PPN + Shipment
 *   C  Sampai Gudang   = A + B
 *   E  Harga Gudang    = C × (1 + ops%)                     (ops% = D)
 *   G  Bottom Price    = E ÷ (1 - profit%)                  (profit% = F)
 *   K  Disc/Komisi/Lain = komisi% + event% + lainnya%       (H + I + J)
 *   L  Harga Pricelist = round(G ÷ (1 - K%), rounding_step)
 *   M  Buffer disc max — carried only, not part of the price.
 */
class PricingEngineCalculator
{
    /**
     * @param  array<string, mixed>  $i  row inputs (percentages + principal price + kurs)
     * @return array<string, float>
     */
    public static function compute(array $i): array
    {
        $f = fn ($k) => (float) ($i[$k] ?? 0);
        $step = (float) ($i['rounding_step'] ?? 1000);
        $step = $step > 0 ? $step : 1000;

        $priceAfterDisc = $f('price_principle') * (1 - $f('disc_principle_pct') / 100);
        $a = $f('kurs') * $priceAfterDisc;

        $bm = $a * $f('bm_pct') / 100;
        $importBase = $a + $bm;
        $pph22 = $importBase * $f('pph22_pct') / 100;
        $ppn = $importBase * $f('ppn_pct') / 100;
        $shipment = $a * $f('shipment_pct') / 100;

        $b = $bm + $pph22 + $ppn + $shipment;
        $c = $a + $b;

        $e = $c * (1 + $f('ops_pct') / 100);

        $profit = $f('profit_pct');
        $g = $profit >= 100 ? $e : $e / (1 - $profit / 100);

        $k = $f('komisi_pct') + $f('event_pct') + $f('lainnya_pct');
        $rawL = $k >= 100 ? $g : $g / (1 - $k / 100);
        $l = round($rawL / $step) * $step;

        return [
            'price_after_disc' => round($priceAfterDisc, 2),
            'a_principal_idr' => round($a, 2),
            'bm' => round($bm, 2),
            'pph22' => round($pph22, 2),
            'ppn' => round($ppn, 2),
            'shipment' => round($shipment, 2),
            'b_total_cost' => round($b, 2),
            'c_warehouse' => round($c, 2),
            'e_harga_gudang' => round($e, 2),
            'g_bottom' => round($g, 2),
            'k_disc_total' => round($k, 4),
            'l_pricelist' => round($l, 2),
        ];
    }
}
