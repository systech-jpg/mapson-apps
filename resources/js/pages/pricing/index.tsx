import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { computePricing, rupiah, type PricingInputs } from '@/lib/pricing';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Inbox, Send } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Finance', href: '#' },
    { title: 'Pricing Engine', href: '/finance/pricing' },
];

interface Currency { code: string; name: string | null; rate_to_idr: string | number }
interface Parameter { id: string; name: string }

interface Product extends PricingInputs {
    id: string;
    sku_code: string;
    product_name: string;
    principal_name: string | null;
    currency_code: string | null;
    final_price: number;
    pending: boolean;
}

interface Props {
    products: Product[];
    currencies: Currency[];
    parameters: Parameter[];
    pendingCount: number;
    canApprove: boolean;
}

const num = (v: number) => Math.round(v).toLocaleString('id-ID');

// Header cell helper
const Th = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <th className={`h-9 border-r border-slate-700 px-2 text-left align-middle text-[10px] font-semibold tracking-wide text-slate-100 uppercase ${className}`}>{children}</th>
);

function PricingRow({ product, currencies, parameterId }: { product: Product; currencies: Currency[]; parameterId: string }) {
    const [state, setState] = useState<PricingInputs & { currency_code: string }>({
        currency_code: product.currency_code ?? '',
        base_price_valas: product.base_price_valas,
        principal_disc_pct: product.principal_disc_pct,
        bm_nominal: product.bm_nominal,
        tax_nominal: product.tax_nominal,
        import_fee_nominal: product.import_fee_nominal,
        opex_pct: product.opex_pct,
        profit_pct: product.profit_pct,
        comm_pct: product.comm_pct,
        ship_sales_pct: product.ship_sales_pct,
    });
    const [processing, setProcessing] = useState(false);

    const rate = Number(currencies.find((c) => c.code === state.currency_code)?.rate_to_idr ?? 0);
    const calc = computePricing(state, rate);
    const pending = product.pending;

    const set = (k: keyof typeof state, v: string) => setState((s) => ({ ...s, [k]: v }));

    const submit = () => {
        setProcessing(true);
        router.post(route('pricing.storeApproval'), { product_id: product.id, parameter_id: parameterId || null, ...state }, {
            preserveScroll: true,
            onFinish: () => setProcessing(false),
        });
    };

    const inputCls = 'h-7 w-full rounded border border-slate-200 bg-white px-1 text-right font-mono text-[11px] focus:border-slate-400 focus:outline-none disabled:bg-transparent disabled:text-slate-500';
    const cell = 'relative z-[10] border-r border-slate-100 px-1 py-1 align-middle';
    const rowBg = pending ? 'bg-orange-50' : 'bg-white hover:bg-slate-50';
    const stick = pending ? 'bg-orange-50' : 'bg-white';

    return (
        <tr className={`h-12 ${rowBg}`}>
            {/* Product identity — frozen left */}
            <td className={`sticky left-0 z-[50] border-r px-2 py-1 align-middle shadow-[4px_0_10px_rgba(0,0,0,0.05)] ${stick}`}>
                <div className="truncate text-[11px] font-semibold text-slate-800">{product.product_name}</div>
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <span className="font-mono">{product.sku_code}</span>
                    {product.principal_name && <span className="truncate">· {product.principal_name}</span>}
                </div>
            </td>

            {/* Currency */}
            <td className={cell}>
                <Select value={state.currency_code || undefined} onValueChange={(v) => set('currency_code', v)} disabled={pending}>
                    <SelectTrigger className="h-7 px-1 text-[11px]"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent position="popper" className="z-[9999]">
                        {currencies.map((c) => (
                            <SelectItem key={c.code} value={c.code} className="text-[11px]">{c.code} · {num(Number(c.rate_to_idr))}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </td>

            <td className={cell}><input className={inputCls} type="number" step="any" value={state.base_price_valas} disabled={pending} onChange={(e) => set('base_price_valas', e.target.value)} /></td>
            <td className={cell}><input className={inputCls} type="number" step="any" value={state.principal_disc_pct} disabled={pending} onChange={(e) => set('principal_disc_pct', e.target.value)} /></td>
            <td className={cell}><input className={inputCls} type="number" step="any" value={state.bm_nominal} disabled={pending} onChange={(e) => set('bm_nominal', e.target.value)} /></td>
            <td className={cell}><input className={inputCls} type="number" step="any" value={state.tax_nominal} disabled={pending} onChange={(e) => set('tax_nominal', e.target.value)} /></td>
            <td className={cell}><input className={inputCls} type="number" step="any" value={state.import_fee_nominal} disabled={pending} onChange={(e) => set('import_fee_nominal', e.target.value)} /></td>

            {/* Computed: CIF & Warehouse */}
            <td className={`${cell} text-right font-mono text-[11px] text-slate-600`}>{num(calc.cif_idr)}</td>
            <td className={`${cell} text-right font-mono text-[11px] text-slate-600`}>{num(calc.warehouse)}</td>

            <td className={cell}><input className={inputCls} type="number" step="any" value={state.opex_pct} disabled={pending} onChange={(e) => set('opex_pct', e.target.value)} /></td>
            <td className={cell}><input className={inputCls} type="number" step="any" value={state.profit_pct} disabled={pending} onChange={(e) => set('profit_pct', e.target.value)} /></td>
            <td className={cell}><input className={inputCls} type="number" step="any" value={state.comm_pct} disabled={pending} onChange={(e) => set('comm_pct', e.target.value)} /></td>
            <td className={cell}><input className={inputCls} type="number" step="any" value={state.ship_sales_pct} disabled={pending} onChange={(e) => set('ship_sales_pct', e.target.value)} /></td>

            {/* Final price — frozen right */}
            <td className="sticky right-0 z-[50] border-l px-2 py-1 align-middle bg-yellow-50 shadow-[-4px_0_10px_rgba(0,0,0,0.05)]">
                <div className="text-right font-mono text-[12px] font-bold text-slate-900">{rupiah(calc.final_pricelist)}</div>
                <div className="text-right font-mono text-[10px] text-slate-500">net {rupiah(calc.deducted)}</div>
                <div className="mt-1 flex justify-end">
                    {pending ? (
                        <span className="animate-pulse rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">Pending</span>
                    ) : (
                        <Button size="sm" className="h-6 px-2 text-[10px]" disabled={processing} onClick={submit}>
                            <Send className="size-3" /> Submit
                        </Button>
                    )}
                </div>
            </td>
        </tr>
    );
}

export default function PricingIndex({ products, currencies, parameters, pendingCount, canApprove }: Props) {
    const [parameterId, setParameterId] = useState(parameters[0]?.id ?? '');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Pricing Engine" />
            <div className="flex h-[calc(100svh-4rem)] flex-col gap-2 overflow-hidden p-3">
                {/* Toolbar */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-base font-semibold">Pricing Engine</h1>
                        <p className="text-[11px] text-muted-foreground">Kalkulasi harga waterfall real-time. Submit perubahan → antrian persetujuan → merge ke master.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">Parameter:</span>
                        <Select value={parameterId} onValueChange={setParameterId}>
                            <SelectTrigger className="h-8 w-56 text-[11px]"><SelectValue placeholder="Pilih parameter" /></SelectTrigger>
                            <SelectContent position="popper" className="z-[9999]">
                                {parameters.map((p) => <SelectItem key={p.id} value={p.id} className="text-[11px]">{p.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        {canApprove && (
                            <Button variant="outline" size="sm" className="h-8" asChild>
                                <Link href={route('pricing.approvals')}>
                                    <Inbox className="size-4" /> Persetujuan
                                    {pendingCount > 0 && <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">{pendingCount}</span>}
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>

                {/* Grid — the only scrollable region */}
                <div className="w-full min-h-0 flex-1 overflow-auto rounded-md border">
                    <table className="w-full min-w-[1400px] table-fixed border-collapse">
                        <colgroup>
                            <col style={{ width: '220px' }} />
                            <col style={{ width: '92px' }} />
                            <col style={{ width: '100px' }} />
                            <col style={{ width: '70px' }} />
                            <col style={{ width: '108px' }} />
                            <col style={{ width: '108px' }} />
                            <col style={{ width: '108px' }} />
                            <col style={{ width: '118px' }} />
                            <col style={{ width: '118px' }} />
                            <col style={{ width: '66px' }} />
                            <col style={{ width: '66px' }} />
                            <col style={{ width: '66px' }} />
                            <col style={{ width: '70px' }} />
                            <col style={{ width: '180px' }} />
                        </colgroup>
                        <thead className="sticky top-0 z-[100] bg-slate-900">
                            <tr>
                                <Th className="sticky left-0 z-[120] bg-slate-900 shadow-[4px_0_10px_rgba(0,0,0,0.2)]">Produk</Th>
                                <Th>Valuta</Th>
                                <Th className="text-right">Base (Valas)</Th>
                                <Th className="text-right">Disc %</Th>
                                <Th className="text-right">BM</Th>
                                <Th className="text-right">Pajak</Th>
                                <Th className="text-right">Import</Th>
                                <Th className="text-right">CIF IDR</Th>
                                <Th className="text-right">Gudang</Th>
                                <Th className="text-right">Opex %</Th>
                                <Th className="text-right">Profit %</Th>
                                <Th className="text-right">Komisi %</Th>
                                <Th className="text-right">Ship %</Th>
                                <Th className="sticky right-0 z-[120] bg-slate-900 text-right shadow-[-4px_0_10px_rgba(0,0,0,0.2)]">Final Price</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.length === 0 ? (
                                <tr><td colSpan={14} className="py-16 text-center text-sm text-muted-foreground">Belum ada produk. Tambahkan di Finance → Data Produk.</td></tr>
                            ) : (
                                products.map((p) => <PricingRow key={p.id} product={p} currencies={currencies} parameterId={parameterId} />)
                            )}
                        </tbody>
                    </table>
                </div>

                <p className="shrink-0 text-[10px] text-muted-foreground">
                    Waterfall: CIF = Base×Rate×(1−Disc) → Gudang = CIF+BM+Pajak+Import → Operating = ×(1+Opex) → Bottom = ÷(1−Profit) → ÷(1−Komisi) → dibulatkan ribuan → net = −Ship%.
                    Baris <span className="font-semibold text-orange-600">Pending</span> dikunci sampai disetujui.
                </p>
            </div>
        </AppLayout>
    );
}
