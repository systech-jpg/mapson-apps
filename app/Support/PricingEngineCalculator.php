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
 * Lock model: only L can be locked as a rupiah value (`locked_pricelist`). Each sell %
 * can be locked as a FLAG (`lock_ops_pct` … `lock_lainnya_pct`). When L is locked and the
 * cost side moves, the price must not move — every UNLOCKED % is scaled by a common factor
 * s (pro-rata to its own value) until the waterfall from C lands exactly on L. Locked %s
 * keep their value. Solved numerically (bisection); if nothing is free, L stays pinned and
 * the %s are left as-is.
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

        $vals = [$f('ops_pct'), $f('profit_pct'), $f('komisi_pct'), $f('event_pct'), $f('lainnya_pct')];

        $lRaw = $i['locked_pricelist'] ?? null;
        $lTarget = ($lRaw === null || $lRaw === '' || (float) $lRaw <= 0) ? null : (float) $lRaw;

        // Effective %s: default to the raw inputs (no L lock, or lock unsolvable).
        $d = $vals;

        if ($lTarget !== null && $c > 0) {
            $lockF = [
                (bool) ($i['lock_ops_pct'] ?? false),
                (bool) ($i['lock_profit_pct'] ?? false),
                (bool) ($i['lock_komisi_pct'] ?? false),
                (bool) ($i['lock_event_pct'] ?? false),
                (bool) ($i['lock_lainnya_pct'] ?? false),
            ];
            // Effective %s at scale s: locked keep their value, free scale pro-rata.
            $at = fn (float $s): array => array_map(
                fn ($v, $locked) => $locked ? $v : $v * $s,
                $vals, $lockF
            );
            $priceAt = function (float $s) use ($at, $c): float {
                [$o, $p, $h, $ev, $la] = $at($s);
                $k = $h + $ev + $la;
                if ($p >= 99.999 || $k >= 99.999) {
                    return INF;
                }

                return $c * (1 + $o / 100) / (1 - $p / 100) / (1 - $k / 100);
            };
            $freeMag = 0.0;
            foreach ($vals as $idx => $v) {
                $freeMag += $lockF[$idx] ? 0 : abs($v);
            }

            if ($freeMag > 0) {
                // Bisection on s — priceAt is monotonic increasing for the usual positive %s.
                $lo = -1.0;
                $hi = 1.0;
                for ($it = 0; $it < 60 && $priceAt($hi) < $lTarget && $hi < 1e6; $it++) {
                    $hi *= 2;
                }
                for ($it = 0; $it < 60 && $priceAt($lo) > $lTarget && $lo > -1e6; $it++) {
                    $lo *= 2;
                }
                for ($it = 0; $it < 200; $it++) {
                    $mid = ($lo + $hi) / 2;
                    if ($priceAt($mid) < $lTarget) {
                        $lo = $mid;
                    } else {
                        $hi = $mid;
                    }
                }
                $d = $at(($lo + $hi) / 2);
            }
            // freeMag == 0 (every % locked, or free %s all zero): nothing can absorb the change —
            // L stays pinned, %s stay as entered (numbers won't reconcile until something is freed).
        }

        [$dOps, $dProfit, $dKomisi, $dEvent, $dLainnya] = $d;
        $kEff = $dKomisi + $dEvent + $dLainnya;
        $e = $c * (1 + $dOps / 100);
        $g = $dProfit >= 100 ? $e : $e / (1 - $dProfit / 100);
        // Pembulatan SELALU ke atas (kebijakan finance); epsilon menahan float error agar
        // nilai yang sudah pas kelipatan step tidak melompat satu step.
        $l = $lTarget !== null
            ? $lTarget
            : ceil(($kEff >= 100 ? $g : $g / (1 - $kEff / 100)) / $step - 1e-9) * $step;

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
            'k_disc_total' => round($kEff, 4),
            'l_pricelist' => round($l, 2),
            'd_ops_pct' => round($dOps, 4),
            'd_profit_pct' => round($dProfit, 4),
            'd_komisi_pct' => round($dKomisi, 4),
            'd_event_pct' => round($dEvent, 4),
            'd_lainnya_pct' => round($dLainnya, 4),
            'any_lock' => $lTarget !== null,
        ];
    }
}
