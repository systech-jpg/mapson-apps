// Profile-based waterfall pricing engine — mirrors app/Support/PricingEngineCalculator.php exactly.
// See that file for the full formula & cost-base documentation.
//
// Locks: E (harga gudang), G (harga bawah), L (harga pricelist) can each be locked to a fixed
// value. Locked points become anchors; unlocked points BETWEEN anchors are prorated along the
// baseline margins, points AFTER the last anchor follow the original percentages. The effective
// percentages (d_*) are then derived back from the final prices — komisi/event/lainnya keep
// their original proportions inside the derived K total.

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
    locked_gudang?: number | string | null; // E locked value (null/'' = unlocked)
    locked_bottom?: number | string | null; // G locked value
    locked_pricelist?: number | string | null; // L locked value
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
    // Effective percentages after locks (equal to the inputs when nothing is locked).
    d_ops_pct: number;
    d_profit_pct: number;
    d_komisi_pct: number;
    d_event_pct: number;
    d_lainnya_pct: number;
    any_lock: boolean;
}

const n = (v: number | string | undefined | null): number => {
    const x = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
    return Number.isFinite(x) ? x : 0;
};

// A lock is active when a positive value is set (null/''/0 = unlocked).
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
    const k = komisi + event + lainnya;

    // Baseline waterfall (no locks).
    const e0 = c * (1 + ops / 100);
    const g0 = profit >= 100 ? e0 : e0 / (1 - profit / 100);
    const l0 = k >= 100 ? g0 : g0 / (1 - k / 100); // raw, pre-rounding

    const locks: (number | null)[] = [null, lockVal(i.locked_gudang), lockVal(i.locked_bottom), lockVal(i.locked_pricelist)];
    const anyLock = locks.some((v) => v != null);

    // Points: [C, E, G, L]. C is always fixed; locked points anchor; intermediates prorate.
    const base = [c, e0, g0, l0];
    const pts: (number | null)[] = [c, null, null, null];
    let lastAnchor = 0;
    for (let j = 1; j <= 3; j++) {
        if (locks[j] == null) continue;
        pts[j] = locks[j];
        const denom = base[j] - base[lastAnchor];
        for (let m = lastAnchor + 1; m < j; m++) {
            pts[m] = denom !== 0
                ? (pts[lastAnchor] as number) + ((base[m] - base[lastAnchor]) * ((pts[j] as number) - (pts[lastAnchor] as number))) / denom
                : (pts[lastAnchor] as number) + (((pts[j] as number) - (pts[lastAnchor] as number)) * (m - lastAnchor)) / (j - lastAnchor);
        }
        lastAnchor = j;
    }
    // Points after the last anchor follow the original percentages.
    if (pts[1] == null) pts[1] = (pts[0] as number) * (1 + ops / 100);
    if (pts[2] == null) pts[2] = profit >= 100 ? (pts[1] as number) : (pts[1] as number) / (1 - profit / 100);
    if (pts[3] == null) {
        const raw = k >= 100 ? (pts[2] as number) : (pts[2] as number) / (1 - k / 100);
        pts[3] = Math.round(raw / step) * step;
    }

    const e = pts[1] as number;
    const g = pts[2] as number;
    const l = pts[3] as number;

    // Effective percentages. Without locks keep the raw inputs (so rounding of L never shifts them).
    let dOps = ops, dProfit = profit, dK = k;
    let dKomisi = komisi, dEvent = event, dLainnya = lainnya;
    if (anyLock) {
        dOps = c > 0 ? (e / c - 1) * 100 : ops;
        dProfit = g > 0 ? (1 - e / g) * 100 : profit;
        dK = l > 0 ? (1 - g / l) * 100 : k;
        if (k > 0) {
            dKomisi = (komisi * dK) / k;
            dEvent = (event * dK) / k;
            dLainnya = (lainnya * dK) / k;
        } else {
            dKomisi = 0;
            dEvent = 0;
            dLainnya = dK;
        }
    }

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
        k_disc_total: dK,
        l_pricelist: l,
        d_ops_pct: dOps,
        d_profit_pct: dProfit,
        d_komisi_pct: dKomisi,
        d_event_pct: dEvent,
        d_lainnya_pct: dLainnya,
        any_lock: anyLock,
    };
}

export const rupiah = (v: number) => 'Rp ' + Math.round(v).toLocaleString('id-ID');
