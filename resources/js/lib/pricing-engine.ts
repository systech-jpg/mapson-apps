// Profile-based waterfall pricing engine — mirrors app/Support/PricingEngineCalculator.php exactly.
// See that file for the full formula & cost-base documentation.

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
}

const n = (v: number | string | undefined): number => {
    const x = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
    return Number.isFinite(x) ? x : 0;
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

    const e = c * (1 + n(i.ops_pct) / 100);

    const profit = n(i.profit_pct);
    const g = profit >= 100 ? e : e / (1 - profit / 100);

    const k = n(i.komisi_pct) + n(i.event_pct) + n(i.lainnya_pct);
    const rawL = k >= 100 ? g : g / (1 - k / 100);
    const l = Math.round(rawL / step) * step;

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
        k_disc_total: k,
        l_pricelist: l,
    };
}

export const rupiah = (v: number) => 'Rp ' + Math.round(v).toLocaleString('id-ID');
