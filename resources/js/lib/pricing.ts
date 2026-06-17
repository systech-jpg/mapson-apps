// Sequential waterfall pricing engine — mirrors app/Support/PricingCalculator.php exactly.

export interface PricingInputs {
    base_price_valas: number | string;
    principal_disc_pct: number | string;
    bm_nominal: number | string;
    tax_nominal: number | string;
    import_fee_nominal: number | string;
    opex_pct: number | string;
    profit_pct: number | string;
    comm_pct: number | string;
    ship_sales_pct: number | string;
}

export interface PricingResult {
    cif_idr: number;
    warehouse: number;
    operating: number;
    bottom: number;
    raw_final: number;
    final_pricelist: number;
    deducted: number;
}

const n = (v: number | string | undefined): number => {
    const x = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
    return Number.isFinite(x) ? x : 0;
};

export function computePricing(i: PricingInputs, rate: number | string): PricingResult {
    const r = n(rate);

    const cifIdr = n(i.base_price_valas) * r * (1 - n(i.principal_disc_pct) / 100);
    const warehouse = cifIdr + n(i.bm_nominal) + n(i.tax_nominal) + n(i.import_fee_nominal);
    const operating = warehouse + (warehouse * n(i.opex_pct)) / 100;

    const profit = n(i.profit_pct);
    const bottom = profit >= 100 ? operating : operating / (1 - profit / 100);

    const comm = n(i.comm_pct);
    const rawFinal = comm >= 100 ? bottom : bottom / (1 - comm / 100);

    const finalPricelist = Math.round(rawFinal / 1000) * 1000;
    const deducted = finalPricelist - (finalPricelist * n(i.ship_sales_pct)) / 100;

    return {
        cif_idr: cifIdr,
        warehouse,
        operating,
        bottom,
        raw_final: rawFinal,
        final_pricelist: finalPricelist,
        deducted,
    };
}

export const rupiah = (v: number) =>
    'Rp ' + Math.round(v).toLocaleString('id-ID');
