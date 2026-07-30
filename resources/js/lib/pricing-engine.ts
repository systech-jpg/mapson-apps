// Profile-based waterfall pricing engine — mirrors app/Support/PricingEngineCalculator.php exactly.
// See that file for the full formula & cost-base documentation.
//
// Lock model: only L (harga pricelist) can be locked as a rupiah value. Each sell percentage
// (ops/profit/komisi/event/lainnya) can be locked as a FLAG. When L is locked and the cost side
// (kurs, harga principal, %biaya) moves, the price must not move — instead every UNLOCKED
// percentage is scaled by a common factor s (pro-rata to its own value) until the waterfall
// from C lands exactly on the locked L. Locked percentages keep their value. Solved numerically
// (bisection on s); if nothing is free to adjust, L stays pinned and the %s are left as-is.

export interface EngineInputs {
    price_principle: number | string;
    disc_principle_pct: number | string;
    kurs: number | string;
    bm_pct: number | string;
    pph22_pct: number | string;
    ppn_pct: number | string;
    shipment_pct: number | string;
    ops_pct: number | string; // D
    profit_pct: number | string; // F
    komisi_pct: number | string; // H
    event_pct: number | string; // I
    lainnya_pct: number | string; // J
    rounding_step?: number | string;
    locked_pricelist?: number | string | null; // L locked value (null/'' = unlocked)
    lock_ops_pct?: boolean | number;
    lock_profit_pct?: boolean | number;
    lock_komisi_pct?: boolean | number;
    lock_event_pct?: boolean | number;
    lock_lainnya_pct?: boolean | number;
}

export interface EngineResult {
    price_after_disc: number;
    a_principal_idr: number;
    bm: number;
    pph22: number;
    ppn: number;
    shipment: number;
    b_total_cost: number;
    c_warehouse: number;
    e_harga_gudang: number;
    g_bottom: number;
    k_disc_total: number;
    l_pricelist: number;
    // Effective percentages after the L lock (equal to the inputs when L is not locked).
    d_ops_pct: number;
    d_profit_pct: number;
    d_komisi_pct: number;
    d_event_pct: number;
    d_lainnya_pct: number;
    any_lock: boolean;
}

const n = (v: number | string | boolean | undefined | null): number => {
    const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'boolean' ? +v : (v ?? 0);
    return Number.isFinite(x) ? x : 0;
};

// The L lock is active when a positive value is set (null/''/0 = unlocked).
const lockVal = (v: number | string | undefined | null): number | null => {
    if (v == null || v === '') return null;
    const x = n(v);
    return x > 0 ? x : null;
};

export function computeEngine(i: EngineInputs): EngineResult {
    const step = n(i.rounding_step) > 0 ? n(i.rounding_step) : 1000;

    const priceAfterDisc = n(i.price_principle) * (1 - n(i.disc_principle_pct) / 100);
    const a = n(i.kurs) * priceAfterDisc;

    const bm = (a * n(i.bm_pct)) / 100;
    const importBase = a + bm;
    const pph22 = (importBase * n(i.pph22_pct)) / 100;
    const ppn = (importBase * n(i.ppn_pct)) / 100;
    const shipment = (a * n(i.shipment_pct)) / 100;

    const b = bm + pph22 + ppn + shipment;
    const c = a + b;

    const ops = n(i.ops_pct);
    const profit = n(i.profit_pct);
    const komisi = n(i.komisi_pct);
    const event = n(i.event_pct);
    const lainnya = n(i.lainnya_pct);

    const lTarget = lockVal(i.locked_pricelist);

    // Effective %s: default to the raw inputs (no L lock, or lock unsolvable).
    let dOps = ops, dProfit = profit, dKomisi = komisi, dEvent = event, dLainnya = lainnya;

    if (lTarget != null && c > 0) {
        const lockF = [!!i.lock_ops_pct, !!i.lock_profit_pct, !!i.lock_komisi_pct, !!i.lock_event_pct, !!i.lock_lainnya_pct];
        const vals = [ops, profit, komisi, event, lainnya];
        // Effective %s at scale s: locked keep their value, free scale pro-rata.
        const at = (s: number) => vals.map((v, idx) => (lockF[idx] ? v : v * s));
        const priceAt = (s: number): number => {
            const [o, p, h, ev, la] = at(s);
            const k = h + ev + la;
            if (p >= 99.999 || k >= 99.999) return Infinity;
            return (c * (1 + o / 100)) / (1 - p / 100) / (1 - k / 100);
        };
        const freeMag = vals.reduce((sum, v, idx) => sum + (lockF[idx] ? 0 : Math.abs(v)), 0);

        if (freeMag > 0) {
            // Bisection on s — priceAt is monotonic increasing for the usual positive %s.
            let lo = -1, hi = 1;
            for (let it = 0; it < 60 && priceAt(hi) < lTarget && hi < 1e6; it++) hi *= 2;
            for (let it = 0; it < 60 && priceAt(lo) > lTarget && lo > -1e6; it++) lo *= 2;
            for (let it = 0; it < 200; it++) {
                const mid = (lo + hi) / 2;
                if (priceAt(mid) < lTarget) lo = mid; else hi = mid;
            }
            [dOps, dProfit, dKomisi, dEvent, dLainnya] = at((lo + hi) / 2);
        }
        // freeMag === 0 (every % locked, or free %s all zero): nothing can absorb the change —
        // L stays pinned, %s stay as entered (numbers won't reconcile until something is freed).
    }

    const kEff = dKomisi + dEvent + dLainnya;
    const e = c * (1 + dOps / 100);
    const g = dProfit >= 100 ? e : e / (1 - dProfit / 100);
    // Pembulatan SELALU ke atas (kebijakan finance); epsilon menahan float error agar
    // nilai yang sudah pas kelipatan step tidak melompat satu step.
    const l = lTarget != null
        ? lTarget
        : Math.ceil((kEff >= 100 ? g : g / (1 - kEff / 100)) / step - 1e-9) * step;

    return {
        price_after_disc: priceAfterDisc,
        a_principal_idr: a,
        bm,
        pph22,
        ppn,
        shipment,
        b_total_cost: b,
        c_warehouse: c,
        e_harga_gudang: e,
        g_bottom: g,
        k_disc_total: kEff,
        l_pricelist: l,
        d_ops_pct: dOps,
        d_profit_pct: dProfit,
        d_komisi_pct: dKomisi,
        d_event_pct: dEvent,
        d_lainnya_pct: dLainnya,
        any_lock: lTarget != null,
    };
}

export const rupiah = (v: number) => 'Rp ' + Math.round(v).toLocaleString('id-ID');
