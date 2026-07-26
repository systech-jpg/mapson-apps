import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface SpendRow { principal: string; idr: number; docs: number }
interface StatusRow { label: string; statut: number; n: number }
interface LeadRow { principal: string; n_po: number; n_arrived: number; d_req_po: number | null; d_po_order: number | null; d_order_arrive: number | null; d_total: number | null }
interface BalanceRow { principal: string; vendor: string; cur: string; amount: number; idr: number }
interface CatRow { kategori: string; idr: number; n: number }
interface AccRow { account: string; idr: number; n: number }
interface Props {
    year: string | null;
    years: string[];
    spending: { total_idr: number; rows: SpendRow[]; others_idr: number; others_n: number };
    status: { pr: StatusRow[]; po: StatusRow[]; pr_total: number; po_total: number; open_po: number };
    leadTime: LeadRow[];
    balances: { available: boolean; error?: string; payable: BalanceRow[]; credit: BalanceRow[]; payable_idr: number; credit_idr: number };
    importCost: { by_category: CatRow[]; by_account: AccRow[]; import_goods_idr: number; cost_idr: number; cost_with_tax_idr: number; rate_pct: number | null };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Purchasing', href: '/dashboard/purchasing' }];

const num = (n: number, d = 0) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: d });
/** Ringkas rupiah utk kartu/label: 1,2 M / 345 jt / 12 rb. */
const rp = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e12) return `${num(n / 1e12, 2)} T`;
    if (a >= 1e9) return `${num(n / 1e9, 2)} M`;
    if (a >= 1e6) return `${num(n / 1e6, 1)} jt`;
    return num(n);
};

export default function PurchasingDashboard({ year, years, spending, status, leadTime, balances, importCost }: Props) {
    const setYear = (y: string | null) => router.get(route('dashboard.purchasing'), y ? { year: y } : {}, { preserveScroll: true, preserveState: true });

    const chartData = [
        ...spending.rows.map((r) => ({ name: r.principal.length > 18 ? r.principal.slice(0, 17) + '…' : r.principal, full: r.principal, idr: r.idr })),
        ...(spending.others_n > 0 ? [{ name: `Lainnya (${spending.others_n})`, full: `${spending.others_n} vendor lain`, idr: spending.others_idr }] : []),
    ];

    const maxLead = Math.max(1, ...leadTime.map((r) => r.d_total ?? ((r.d_req_po ?? 0) + (r.d_po_order ?? 0) + (r.d_order_arrive ?? 0))));

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Purchasing" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold">Purchasing — Executive Dashboard</h1>
                        <p className="text-sm text-muted-foreground">
                            Pembelian dari Accurate & ERP: spending per principal, status PR/PO, lead time, utang & CN, dan biaya impor.
                        </p>
                    </div>
                    <div className="flex gap-1">
                        <Seg active={!year} onClick={() => setYear(null)}>Semua</Seg>
                        {years.map((y) => <Seg key={y} active={year === y} onClick={() => setYear(y)}>{y}</Seg>)}
                    </div>
                </div>

                {/* KPI */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Kpi label={`Total Purchase${year ? ` ${year}` : ''}`} value={`Rp ${rp(spending.total_idr)}`} sub={`${num(spending.rows.reduce((s, r) => s + r.docs, 0) )}+ dokumen`} />
                    <Kpi label="Open PO" value={num(status.open_po)} sub={`dari ${num(status.po_total)} PO${year ? ` di ${year}` : ''}`} />
                    <Kpi label="Utang Vendor (Payable)" value={balances.available ? `Rp ${rp(balances.payable_idr)}` : '—'} sub={balances.available ? `${balances.payable.length} vendor · saldo live Accurate` : 'Accurate tidak terjangkau'} />
                    <Kpi label="Saldo CN / Kredit" value={balances.available ? `Rp ${rp(balances.credit_idr)}` : '—'} sub={balances.available ? `${balances.credit.length} vendor · kredit kita di vendor` : 'Accurate tidak terjangkau'} />
                </div>

                {/* Baris 2: spending + status */}
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Purchase by Principal</CardTitle>
                            <p className="text-xs text-muted-foreground">Nilai faktur pembelian Accurate, terkonversi IDR{year ? ` — ${year}` : ' — semua tahun'}.</p>
                        </CardHeader>
                        <CardContent className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                                    <XAxis type="number" tickFormatter={(v) => rp(v)} tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                                    <Tooltip formatter={(v: number) => [`Rp ${num(v)}`, 'Nilai']} labelFormatter={(_, p) => (p?.[0]?.payload?.full ?? '') as string} />
                                    <Bar dataKey="idr" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Status PR / PO (ERP)</CardTitle>
                            <p className="text-xs text-muted-foreground">
                                {num(status.pr_total)} Request PO (RPO) · {num(status.po_total)} PO{year ? ` — ${year}` : ''}.
                            </p>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <StatusList title="Request PO" rows={status.pr} total={status.pr_total} done={[2, 4]} />
                            <StatusList title="Purchase Order" rows={status.po} total={status.po_total} done={[5]} />
                        </CardContent>
                    </Card>
                </div>

                {/* Baris 3: lead time */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Lead Time per Principal (hari, rata-rata)</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Request (RPO dibuat) → PO dibuat → order ke vendor → barang datang (penerimaan pertama). Segmen kosong = data tahap itu tidak ada; tanggal mundur (backdate) dikecualikan.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                            <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-sky-500" />Request → PO</span>
                            <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-amber-500" />PO → Order</span>
                            <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-emerald-500" />Order → Barang datang</span>
                        </div>
                        <div className="space-y-1.5">
                            {leadTime.filter((r) => r.n_po >= 2).map((r) => {
                                const segs = [
                                    { v: r.d_req_po, cls: 'bg-sky-500' },
                                    { v: r.d_po_order, cls: 'bg-amber-500' },
                                    { v: r.d_order_arrive, cls: 'bg-emerald-500' },
                                ].filter((s) => s.v !== null && s.v > 0) as { v: number; cls: string }[];
                                const total = r.d_total ?? segs.reduce((s, x) => s + x.v, 0);
                                return (
                                    <div key={r.principal} className="flex items-center gap-2 text-xs">
                                        <span className="w-44 shrink-0 truncate" title={`${r.principal} — ${r.n_po} PO, ${r.n_arrived} sudah diterima`}>{r.principal}</span>
                                        <div className="flex h-4 flex-1 overflow-hidden rounded-sm bg-muted/40">
                                            {segs.map((s, i) => (
                                                <div key={i} className={`${s.cls} flex items-center justify-center overflow-hidden text-[9px] text-white`}
                                                    style={{ width: `${(s.v / maxLead) * 100}%` }} title={`${s.v} hari`}>
                                                    {(s.v / maxLead) > 0.07 ? num(s.v, 1) : ''}
                                                </div>
                                            ))}
                                        </div>
                                        <span className="w-16 shrink-0 text-right tabular-nums font-medium">{total ? `${num(total, 1)} hr` : '–'}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Baris 4: payable & CN + import cost */}
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Utang & Credit Note per Principal</CardTitle>
                            <p className="text-xs text-muted-foreground">Saldo vendor live dari Accurate — positif = utang kita, negatif = kredit/CN kita di vendor.</p>
                        </CardHeader>
                        <CardContent>
                            {!balances.available ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">Accurate tidak terjangkau: {balances.error}</p>
                            ) : (
                                <Table className="text-sm [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Principal / Vendor</TableHead>
                                            <TableHead>Jenis</TableHead>
                                            <TableHead className="text-right">Saldo (asli)</TableHead>
                                            <TableHead className="text-right">± IDR</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {balances.payable.length + balances.credit.length === 0 && (
                                            <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Tidak ada saldo terbuka.</TableCell></TableRow>
                                        )}
                                        {balances.payable.map((r) => (
                                            <TableRow key={`p-${r.vendor}`}>
                                                <TableCell className="font-medium">{r.principal}</TableCell>
                                                <TableCell><Badge variant="outline" className="border-amber-400 text-[10px] text-amber-600 dark:text-amber-400">Utang</Badge></TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">{r.cur} {num(r.amount, 2)}</TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">{num(r.idr)}</TableCell>
                                            </TableRow>
                                        ))}
                                        {balances.credit.map((r) => (
                                            <TableRow key={`c-${r.vendor}`}>
                                                <TableCell className="font-medium">{r.principal}</TableCell>
                                                <TableCell><Badge variant="outline" className="border-emerald-400 text-[10px] text-emerald-600 dark:text-emerald-400">CN / Kredit</Badge></TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">{r.cur} {num(r.amount, 2)}</TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">{num(r.idr)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Analisa Biaya Impor</CardTitle>
                            <p className="text-xs text-muted-foreground">
                                Dari baris biaya faktur pembelian Accurate (freight, PIB/bea, storage). Rate = biaya non-pajak ÷ nilai barang impor{year ? ` — ${year}` : ''}.
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-3 gap-2">
                                <MiniStat label="Nilai barang impor" value={`Rp ${rp(importCost.import_goods_idr)}`} />
                                <MiniStat label="Biaya impor (non-pajak)" value={`Rp ${rp(importCost.cost_idr)}`} />
                                <MiniStat label="Rate biaya impor" value={importCost.rate_pct !== null ? `${num(importCost.rate_pct, 2)}%` : '–'} accent />
                            </div>

                            <div>
                                <p className="mb-1.5 text-xs font-medium">Komposisi per kategori</p>
                                <div className="space-y-1">
                                    {importCost.by_category.map((c) => {
                                        const maxC = Math.max(1, ...importCost.by_category.map((x) => x.idr));
                                        return (
                                            <div key={c.kategori} className="flex items-center gap-2 text-xs">
                                                <span className="w-36 shrink-0 truncate">{c.kategori}</span>
                                                <div className="h-3.5 flex-1 overflow-hidden rounded-sm bg-muted/40">
                                                    <div className="h-full rounded-sm bg-primary/80" style={{ width: `${(c.idr / maxC) * 100}%` }} />
                                                </div>
                                                <span className="w-24 shrink-0 text-right tabular-nums">Rp {rp(c.idr)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="mt-1 text-[11px] text-muted-foreground">Pajak (PPN/PPh) ditampilkan sebagai kategori tapi tidak dihitung dalam rate (dapat dikreditkan).</p>
                            </div>

                            <div>
                                <p className="mb-1.5 text-xs font-medium">Per akun biaya</p>
                                <div className="space-y-0.5 text-xs">
                                    {importCost.by_account.map((a) => (
                                        <div key={a.account} className="flex items-center justify-between gap-2">
                                            <span className="truncate text-muted-foreground">{a.account} <span className="text-muted-foreground/60">({a.n})</span></span>
                                            <span className="shrink-0 tabular-nums">Rp {num(a.idr)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-lg border p-3.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
            {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
        </div>
    );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="rounded-md border p-2.5">
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <p className={`mt-0.5 text-sm font-semibold tabular-nums ${accent ? 'text-primary' : ''}`}>{value}</p>
        </div>
    );
}

function StatusList({ title, rows, total, done }: { title: string; rows: StatusRow[]; total: number; done: number[] }) {
    return (
        <div>
            <p className="mb-1.5 text-xs font-medium">{title} <span className="text-muted-foreground">({num(total)})</span></p>
            <div className="space-y-1">
                {rows.map((r) => (
                    <div key={r.statut} className="flex items-center gap-2 text-xs">
                        <span className="w-32 shrink-0 truncate">{r.label}</span>
                        <div className="h-3.5 flex-1 overflow-hidden rounded-sm bg-muted/40">
                            <div className={`h-full rounded-sm ${done.includes(r.statut) ? 'bg-emerald-500/80' : r.statut >= 6 ? 'bg-red-400/70' : 'bg-sky-500/80'}`}
                                style={{ width: `${(r.n / Math.max(1, total)) * 100}%` }} />
                        </div>
                        <span className="w-10 shrink-0 text-right tabular-nums">{num(r.n)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" onClick={onClick}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
            {children}
        </button>
    );
}
