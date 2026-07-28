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
 *
 * Locks: E/G/L may each be locked to a fixed value (keys locked_gudang / locked_bottom /
 * locked_pricelist, null|0 = unlocked). Locked points anchor the chain; unlocked points
 * BETWEEN anchors are prorated along the baseline margins, points AFTER the last anchor
 * follow the original percentages. Effective percentages (d_*) are derived back from the
 * final prices — komisi/event/lainnya keep their original proportions inside derived K.
 */
class PricingEngineCalculator
{
    /**
     * @param  array<string, mixed>  $i  row inputs (percentages + principal price + kurs + locks)
     * @return array<string, mixed>
     */
    public static function compute(array $i): array
    {
        $f = fn ($k) => (float) ($i[$k] ?? 0);
        $lock = function ($k) use ($i): ?float {
            $v = $i[$k] ?? null;
            if ($v === null || $v === '') {
                return null;
            }

            return (float) $v > 0 ? (float) $v : null;
        };
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

        $ops = $f('ops_pct');
        $profit = $f('profit_pct');
        $komisi = $f('komisi_pct');
        $event = $f('event_pct');
        $lainnya = $f('lainnya_pct');
        $k = $komisi + $event + $lainnya;

        // Baseline waterfall (no locks).
        $e0 = $c * (1 + $ops / 100);
        $g0 = $profit >= 100 ? $e0 : $e0 / (1 - $profit / 100);
        $l0 = $k >= 100 ? $g0 : $g0 / (1 - $k / 100);   // raw, pre-rounding

        $locks = [null, $lock('locked_gudang'), $lock('locked_bottom'), $lock('locked_pricelist')];
        $anyLock = collect($locks)->contains(fn ($v) => $v !== null);

        // Points: [C, E, G, L]. C is always fixed; locked points anchor; intermediates prorate.
        $base = [$c, $e0, $g0, $l0];
        $pts = [$c, null, null, null];
        $lastAnchor = 0;
        for ($j = 1; $j <= 3; $j++) {
            if ($locks[$j] === null) {
                continue;
            }
            $pts[$j] = $locks[$j];
            $denom = $base[$j] - $base[$lastAnchor];
            for ($m = $lastAnchor + 1; $m < $j; $m++) {
                $pts[$m] = $denom != 0.0
                    ? $pts[$lastAnchor] + ($base[$m] - $base[$lastAnchor]) * ($pts[$j] - $pts[$lastAnchor]) / $denom
                    : $pts[$lastAnchor] + ($pts[$j] - $pts[$lastAnchor]) * ($m - $lastAnchor) / ($j - $lastAnchor);
            }
            $lastAnchor = $j;
        }
        // Points after the last anchor follow the original percentages.
        if ($pts[1] === null) {
            $pts[1] = $pts[0] * (1 + $ops / 100);
        }
        if ($pts[2] === null) {
            $pts[2] = $profit >= 100 ? $pts[1] : $pts[1] / (1 - $profit / 100);
        }
        if ($pts[3] === null) {
            $raw = $k >= 100 ? $pts[2] : $pts[2] / (1 - $k / 100);
            $pts[3] = round($raw / $step) * $step;
        }

        [, $e, $g, $l] = $pts;

        // Effective percentages. Without locks keep the raw inputs (so rounding of L never shifts them).
        [$dOps, $dProfit, $dK] = [$ops, $profit, $k];
        [$dKomisi, $dEvent, $dLainnya] = [$komisi, $event, $lainnya];
        if ($anyLock) {
            $dOps = $c > 0 ? ($e / $c - 1) * 100 : $ops;
            $dProfit = $g > 0 ? (1 - $e / $g) * 100 : $profit;
            $dK = $l > 0 ? (1 - $g / $l) * 100 : $k;
            if ($k > 0) {
                $dKomisi = $komisi * $dK / $k;
                $dEvent = $event * $dK / $k;
                $dLainnya = $lainnya * $dK / $k;
            } else {
                [$dKomisi, $dEvent, $dLainnya] = [0.0, 0.0, $dK];
            }
        }

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
            'k_disc_total' => round($dK, 4),
            'l_pricelist' => round($l, 2),
            'd_ops_pct' => round($dOps, 4),
            'd_profit_pct' => round($dProfit, 4),
            'd_komisi_pct' => round($dKomisi, 4),
            'd_event_pct' => round($dEvent, 4),
            'd_lainnya_pct' => round($dLainnya, 4),
            'any_lock' => $anyLock,
        ];
    }
}
