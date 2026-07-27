import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DashboardLayout from '@/layouts/dashboard-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface SpendRow { principal: string; idr: number; docs: number }
interface StatusRow { label: string; statut: number; n: number }
interface LeadRow { principal: string; n_po: number; n_arrived: number; d_req_po: number | null; d_po_order: number | null; d_order_arrive: number | null; d_total: number | null }
interface BalanceRow { vendor_id: number; principal: string; vendor: string; cur: string; amount: number; idr: number }
interface CatRow { kategori: string; idr: number; n: number }
interface AccRow { account: string; idr: number; n: number }
interface YearRateRow { tahun: string; goods: number; cost: number; rate_pct: number | null }
interface ExpVendorRow { vendor: string; idr: number; n: number }
interface TopPoRow { po: string; principal: string | null; idr: number }
interface ImpDrill { label: string; params: Record<string, string> }
interface ExpDetailRow { doc_number: string; trans_date: string; vendor: string; account: string; notes: string; kategori: string; amount: number; idr: number }
type DrillType = 'purchase' | 'open_po' | 'payable' | 'credit' | 'pr_status' | 'po_status' | 'ap';
interface DrillSpec { type: DrillType; principal?: string; statut?: number; label?: string; vendorId?: number; cur?: string }
interface PurchaseDoc { po: string; has_po: boolean; docs: string; n_docs: number; trans_date: string; vendor: string; principal: string; cur: string; asli: number; idr: number; n_items: number }
interface OpenPoRow { ref: string; principal: string; vendor: string; tanggal: string; status?: string; cur: string; total: number; umur: number; acc_status: string | null; acc_percent: number | null }
interface PrRow { ref: string; principal: string; vendor: string; tanggal: string; cur: string; total: number }
interface ApRow { number: string; bill_number: string | null; trans_date: string | null; due_date: string | null; total: number; owing: number | null; overdue: number | null }
interface Props {
    year: string | null;
    years: string[];
    spending: { total_idr: number; rows: SpendRow[]; others_idr: number; others_n: number };
    status: { pr: StatusRow[]; po: StatusRow[]; pr_total: number; po_total: number; open_po: number };
    leadTime: LeadRow[];
    balances: { available: boolean; error?: string; payable: BalanceRow[]; credit: BalanceRow[]; payable_idr: number; credit_idr: number };
    importCost: { by_category: CatRow[]; by_account: AccRow[]; by_year: YearRateRow[]; by_vendor: ExpVendorRow[]; top_po: TopPoRow[]; import_goods_idr: number; cost_idr: number; cost_with_tax_idr: number; rate_pct: number | null };
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
    const [tab, setTab] = useState('summary');
    const [drill, setDrill] = useState<DrillSpec | null>(null);
    const [impDrill, setImpDrill] = useState<ImpDrill | null>(null);
    const [pivotPrincipal, setPivotPrincipal] = useState<string | null>(null);
    const maxCat = Math.max(1, ...importCost.by_category.map((x) => x.idr));

    // Data biaya per PO (utk tab impor): dipakai tabel hierarki DAN kartu statistik per principal.
    const [poCosts, setPoCosts] = useState<{ rows: PoCostRow[]; unattributed: { cost: number; tax: number; n: number } } | null>(null);
    const [impPrincipal, setImpPrincipal] = useState<string | null>(null);
    useEffect(() => {
        fetch(route('dashboard.purchasing.import-po-costs'), { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then(setPoCosts)
            .catch(() => setPoCosts({ rows: [], unattributed: { cost: 0, tax: 0, n: 0 } }));
    }, []);
    const impPrincipals = useMemo(() => [...new Set((poCosts?.rows ?? []).map((r) => r.principal).filter(Boolean))].sort() as string[], [poCosts]);
    // Baris per-PO mengikuti filter tahun header.
    const poRowsFiltered = useMemo(() => (poCosts?.rows ?? []).filter((r) => !year || (r.tanggal?.startsWith(year) ?? false)), [poCosts, year]);
    // Statistik: "semua principal" pakai angka global server (sudah ikut tahun);
    // principal terpilih dihitung dari alokasi per-PO yang terfilter.
    const impStats = useMemo(() => {
        if (!impPrincipal) {
            return { goods: importCost.import_goods_idr, cost: importCost.cost_idr, tax: importCost.cost_with_tax_idr - importCost.cost_idr, rate: importCost.rate_pct, alloc: false };
        }
        const rows = poRowsFiltered.filter((r) => r.principal === impPrincipal);
        const goods = rows.reduce((a, r) => a + r.goods, 0);
        const cost = rows.reduce((a, r) => a + r.cost, 0);
        const tax = rows.reduce((a, r) => a + r.tax, 0);
        return { goods, cost, tax, rate: goods > 0 && cost >= 1 ? Math.round(cost / goods * 10000) / 100 : null, alloc: true };
    }, [impPrincipal, poRowsFiltered, importCost]);

    const chartData = [
        ...spending.rows.map((r) => ({ name: r.principal.length > 18 ? r.principal.slice(0, 17) + '…' : r.principal, full: r.principal, principal: r.principal, idr: r.idr })),
        ...(spending.others_n > 0 ? [{ name: `Lainnya (${spending.others_n})`, full: `${spending.others_n} vendor lain`, principal: undefined as string | undefined, idr: spending.others_idr }] : []),
    ];

    const maxLead = Math.max(1, ...leadTime.map((r) => r.d_total ?? ((r.d_req_po ?? 0) + (r.d_po_order ?? 0) + (r.d_order_arrive ?? 0))));

    return (
        <DashboardLayout breadcrumbs={breadcrumbs}>
            <Head title="Purchasing" />
            <div className="flex flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold">Purchasing — Executive Dashboard</h1>
                        <p className="text-sm text-muted-foreground">
                            Pembelian dari Accurate & ERP: spending per principal, status PR/PO, lead time, utang & CN, dan biaya impor.
                        </p>
                        {tab === 'import' && (
                            <div className="mt-2">
                                <PrincipalPicker principals={impPrincipals} value={impPrincipal} onChange={setImpPrincipal} />
                            </div>
                        )}
                    </div>
                    <div className="flex gap-1">
                        <Seg active={!year} onClick={() => setYear(null)}>Semua</Seg>
                        {years.map((y) => <Seg key={y} active={year === y} onClick={() => setYear(y)}>{y}</Seg>)}
                    </div>
                </div>

                <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col gap-4">
                <TabsList className="w-fit">
                    <TabsTrigger value="summary">Summary Executive</TabsTrigger>
                    <TabsTrigger value="import">Analisa Biaya Impor</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="mt-0 flex flex-col gap-4">
                {/* KPI — klik untuk drill detail */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Kpi label={`Total Purchase${year ? ` ${year}` : ''}`} value={`Rp ${rp(spending.total_idr)}`} sub={`${num(spending.rows.reduce((s, r) => s + r.docs, 0) )}+ dokumen · klik utk detail`} onClick={() => setDrill({ type: 'purchase' })} />
                    <Kpi label="Open PO" value={num(status.open_po)} sub={`dari ${num(status.po_total)} PO${year ? ` di ${year}` : ''} · belum diterima penuh`} onClick={() => setDrill({ type: 'open_po' })} />
                    <Kpi label="Utang Vendor (Payable)" value={balances.available ? `Rp ${rp(balances.payable_idr)}` : '—'} sub={balances.available ? `${balances.payable.length} vendor · saldo live Accurate` : 'Accurate tidak terjangkau'} onClick={balances.available ? () => setDrill({ type: 'payable' }) : undefined} />
                    <Kpi label="Saldo CN / Kredit" value={balances.available ? `Rp ${rp(balances.credit_idr)}` : '—'} sub={balances.available ? `${balances.credit.length} vendor · kredit kita di vendor` : 'Accurate tidak terjangkau'} onClick={balances.available ? () => setDrill({ type: 'credit' }) : undefined} />
                </div>

                {/* Baris 2: spending + status */}
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Purchase by Principal</CardTitle>
                            <p className="text-xs text-muted-foreground">Nilai pembelian terkonversi IDR{year ? ` — ${year}` : ' — semua tahun'} · klik bar untuk ringkasan principal di kanan.</p>
                        </CardHeader>
                        <CardContent className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                                    <XAxis type="number" tickFormatter={(v) => rp(v)} tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} interval={0} />
                                    <Tooltip formatter={(v: number) => [`Rp ${num(v)}`, 'Nilai']} labelFormatter={(_, p) => (p?.[0]?.payload?.full ?? '') as string} />
                                    <Bar dataKey="idr" fill="var(--primary)" radius={[0, 4, 4, 0]} className="cursor-pointer"
                                        onClick={(d: { payload?: { principal?: string } }) => d?.payload?.principal && setPivotPrincipal(d.payload.principal)} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <SpendPivotCard principal={pivotPrincipal} onClear={() => setPivotPrincipal(null)} />
                </div>

                {/* Baris 3: lead time + status PR/PO */}
                <div className="grid gap-4 lg:grid-cols-2">
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

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Status PR/PO & Utang–CN per Principal</CardTitle>
                            <p className="text-xs text-muted-foreground">
                                {num(status.pr_total)} RPO · {num(status.po_total)} PO{year ? ` — ${year}` : ''} · klik status/baris untuk detail. Saldo vendor live dari Accurate.
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <StatusList title="Request PO" rows={status.pr} total={status.pr_total} done={[2, 4]}
                                    onPick={(r) => setDrill({ type: 'pr_status', statut: r.statut, label: `Request PO — ${r.label}` })} />
                                <StatusList title="Purchase Order" rows={status.po} total={status.po_total} done={[5]}
                                    onPick={(r) => setDrill({ type: 'po_status', statut: r.statut, label: `PO — ${r.label}` })} />
                            </div>
                            <div className="border-t pt-3">
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
                                            <TableRow key={`p-${r.vendor}`} className="cursor-pointer"
                                                onClick={() => setDrill({ type: 'ap', vendorId: r.vendor_id, label: `Faktur Outstanding — ${r.vendor}`, cur: r.cur })}>
                                                <TableCell className="font-medium">{r.principal}</TableCell>
                                                <TableCell><Badge variant="outline" className="border-amber-400 text-[10px] text-amber-600 dark:text-amber-400">Utang</Badge></TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">{r.cur} {num(r.amount, 2)}</TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">{num(r.idr)}</TableCell>
                                            </TableRow>
                                        ))}
                                        {balances.credit.map((r) => (
                                            <TableRow key={`c-${r.vendor}`} className="cursor-pointer"
                                                onClick={() => setDrill({ type: 'ap', vendorId: r.vendor_id, label: `Saldo Kredit — ${r.vendor}`, cur: r.cur })}>
                                                <TableCell className="font-medium">{r.principal}</TableCell>
                                                <TableCell><Badge variant="outline" className="border-emerald-400 text-[10px] text-emerald-600 dark:text-emerald-400">CN / Kredit</Badge></TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">{r.cur} {num(r.amount, 2)}</TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">{num(r.idr)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
                </TabsContent>

                <TabsContent value="import" className="mt-0 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Kpi label={`Nilai barang impor${year ? ` ${year}` : ""}`} value={`Rp ${rp(impStats.goods)}`}
                            sub={impStats.alloc ? `${impPrincipal ?? 'semua principal'} — realisasi PO teralokasi` : 'baris item vendor bermata uang asing'} />
                        <Kpi label="Biaya impor (non-pajak)" value={`Rp ${rp(impStats.cost)}`}
                            sub={impStats.alloc ? 'alokasi dari ref PO di catatan biaya' : 'freight, PIB/bea, storage, dll'}
                            onClick={() => setImpDrill({ label: impPrincipal ? `Biaya impor — ${impPrincipal}` : 'Semua biaya impor', params: impPrincipal ? { q: impPrincipal } : {} })} />
                        <Kpi label="Rate biaya impor" value={impStats.rate !== null ? `${num(impStats.rate, 2)}%` : '–'} sub="biaya non-pajak ÷ nilai barang impor" />
                        <Kpi label={impStats.alloc ? 'Pajak impor (alokasi)' : 'Biaya termasuk pajak'} value={`Rp ${rp(impStats.alloc ? impStats.tax : importCost.cost_with_tax_idr)}`}
                            sub={impStats.alloc ? 'PPN/PPh teralokasi ke PO terfilter' : 'PPN/PPh impor ikut dihitung'} />
                    </div>

                    <ImportPoCard data={poCosts ? { rows: poRowsFiltered, unattributed: poCosts.unattributed } : null} principal={impPrincipal} />

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Tren Rate per Tahun</CardTitle>
                                <p className="text-xs text-muted-foreground">Semua tahun (tak ikut filter) — klik tahun untuk baris biayanya.</p>
                            </CardHeader>
                            <CardContent>
                                <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Tahun</TableHead>
                                            <TableHead className="text-right">Barang Impor</TableHead>
                                            <TableHead className="text-right">Biaya (non-pajak)</TableHead>
                                            <TableHead className="text-right">Rate</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {importCost.by_year.map((r) => (
                                            <TableRow key={r.tahun} className="cursor-pointer"
                                                onClick={() => setImpDrill({ label: `Biaya impor ${r.tahun}`, params: { year: r.tahun } })}>
                                                <TableCell className="font-medium text-primary">{r.tahun}</TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">Rp {rp(r.goods)}</TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">Rp {rp(r.cost)}</TableCell>
                                                <TableCell className={`text-right tabular-nums font-medium ${r.rate_pct !== null && r.rate_pct > 12 ? 'text-red-600 dark:text-red-400' : ''}`}>
                                                    {r.rate_pct !== null ? `${num(r.rate_pct, 2)}%` : '–'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Komposisi per Kategori</CardTitle>
                                <p className="text-xs text-muted-foreground">
                                    {year ? `Tahun ${year}` : 'Semua tahun'} · klik kategori untuk baris biayanya. Pajak tampil tapi tak dihitung dalam rate (dapat dikreditkan).
                                </p>
                            </CardHeader>
                            <CardContent className="space-y-1.5">
                                {importCost.by_category.map((c) => (
                                    <button key={c.kategori} type="button"
                                        onClick={() => setImpDrill({ label: `Biaya — ${c.kategori}`, params: { kategori: c.kategori, ...(year ? { year } : {}) } })}
                                        className="flex w-full items-center gap-2 rounded-sm text-left text-xs transition-colors hover:bg-accent">
                                        <span className="w-36 shrink-0 truncate">{c.kategori}</span>
                                        <div className="h-4 flex-1 overflow-hidden rounded-sm bg-muted/40">
                                            <div className="h-full rounded-sm bg-primary/80" style={{ width: `${(c.idr / maxCat) * 100}%` }} />
                                        </div>
                                        <span className="w-24 shrink-0 text-right tabular-nums">Rp {rp(c.idr)}</span>
                                        <span className="w-12 shrink-0 text-right text-muted-foreground">({c.n})</span>
                                    </button>
                                ))}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Biaya per Penyedia Jasa</CardTitle>
                                <p className="text-xs text-muted-foreground">Vendor di faktur biaya (forwarder, bea cukai, dll){year ? ` — ${year}` : ''} · klik untuk rinciannya.</p>
                            </CardHeader>
                            <CardContent>
                                <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Vendor Jasa</TableHead>
                                            <TableHead className="text-right">Baris</TableHead>
                                            <TableHead className="text-right">Biaya (IDR)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {importCost.by_vendor.map((v) => (
                                            <TableRow key={v.vendor} className="cursor-pointer"
                                                onClick={() => setImpDrill({ label: `Biaya — ${v.vendor}`, params: { vendor: v.vendor, ...(year ? { year } : {}) } })}>
                                                <TableCell className="max-w-56 truncate font-medium" title={v.vendor}>{v.vendor}</TableCell>
                                                <TableCell className="text-right tabular-nums text-muted-foreground">{num(v.n)}</TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">{num(v.idr)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Per Akun Biaya</CardTitle>
                                <p className="text-xs text-muted-foreground">{year ? `Tahun ${year}` : 'Semua tahun'} · klik akun untuk baris biayanya.</p>
                            </CardHeader>
                            <CardContent>
                                <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Akun</TableHead>
                                            <TableHead className="text-right">Baris</TableHead>
                                            <TableHead className="text-right">Total (IDR)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {importCost.by_account.map((a) => (
                                            <TableRow key={a.account} className="cursor-pointer"
                                                onClick={() => setImpDrill({ label: `Biaya — ${a.account}`, params: { account_no: a.account.split(' ')[0], ...(year ? { year } : {}) } })}>
                                                <TableCell className="font-medium">{a.account}</TableCell>
                                                <TableCell className="text-right tabular-nums text-muted-foreground">{num(a.n)}</TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">{num(a.idr)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>

                </TabsContent>
                </Tabs>
            </div>

            <ImportDrillDialog spec={impDrill} onClose={() => setImpDrill(null)} />

            <KpiDrillDialog spec={drill} year={year} balances={balances} onClose={() => setDrill(null)} />
        </DashboardLayout>
    );
}

const DRILL_TITLE: Record<DrillType, string> = {
    purchase: 'Detail Total Purchase — per PO',
    open_po: 'Detail Open PO — PO berjalan, belum diterima penuh',
    payable: 'Detail Utang Vendor (Payable)',
    credit: 'Detail Saldo CN / Kredit',
    pr_status: 'Request PO',
    po_status: 'Purchase Order',
};

/** Drill dashboard: purchase/open_po/status fetch endpoint; payable & credit dari props (live). */
function KpiDrillDialog({ spec, year, balances, onClose }: {
    spec: DrillSpec | null; year: string | null;
    balances: Props['balances']; onClose: () => void;
}) {
    const type = spec?.type ?? null;
    const [docs, setDocs] = useState<PurchaseDoc[] | null>(null);
    const [pos, setPos] = useState<OpenPoRow[] | null>(null);
    const [prs, setPrs] = useState<PrRow[] | null>(null);
    const [aps, setAps] = useState<ApRow[] | null>(null);
    const [q, setQ] = useState('');

    useEffect(() => {
        setDocs(null); setPos(null); setPrs(null); setAps(null); setQ('');
        if (!spec || spec.type === 'payable' || spec.type === 'credit') return;
        if (spec.type === 'ap') {
            fetch(route('dashboard.purchasing.ap-drill') + `?vendor_id=${spec.vendorId}`, { headers: { Accept: 'application/json' } })
                .then((r) => r.json())
                .then((d) => setAps(d.rows ?? []))
                .catch(() => setAps([]));
            return;
        }
        const params = new URLSearchParams({ type: spec.type });
        if (year) params.set('year', year);
        if (spec.principal) params.set('principal', spec.principal);
        if (spec.statut !== undefined) params.set('statut', String(spec.statut));
        fetch(route('dashboard.purchasing.kpi-drill') + `?${params}`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((d) => {
                if (spec.type === 'purchase') setDocs(d.rows ?? []);
                else if (spec.type === 'pr_status') setPrs(d.rows ?? []);
                else setPos(d.rows ?? []);
            })
            .catch(() => { setDocs([]); setPos([]); setPrs([]); });
    }, [spec, year]);

    const s = q.trim().toLowerCase();
    const fDocs = useMemo(() => (docs ?? []).filter((d) => !s || d.po.toLowerCase().includes(s) || (d.docs ?? '').toLowerCase().includes(s) || d.vendor.toLowerCase().includes(s) || d.principal.toLowerCase().includes(s)), [docs, s]);
    const fPos = useMemo(() => (pos ?? []).filter((d) => !s || d.ref.toLowerCase().includes(s) || (d.vendor ?? '').toLowerCase().includes(s) || (d.principal ?? '').toLowerCase().includes(s)), [pos, s]);
    const fPrs = useMemo(() => (prs ?? []).filter((d) => !s || d.ref.toLowerCase().includes(s) || (d.vendor ?? '').toLowerCase().includes(s) || (d.principal ?? '').toLowerCase().includes(s)), [prs, s]);
    const fBal = useMemo(() => {
        const rows = type === 'payable' ? balances.payable : type === 'credit' ? balances.credit : [];
        return rows.filter((r) => !s || r.vendor.toLowerCase().includes(s) || r.principal.toLowerCase().includes(s));
    }, [type, balances, s]);

    const loading = (type === 'purchase' && docs === null) || ((type === 'open_po' || type === 'po_status') && pos === null) || (type === 'pr_status' && prs === null) || (type === 'ap' && aps === null);

    return (
        <Dialog open={spec !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>
                        {spec?.label ?? (type ? DRILL_TITLE[type] : '')}
                        {spec?.principal ? ` — ${spec.principal}` : ''}{year ? ` · ${year}` : ''}
                    </DialogTitle>
                    <DialogDescription>
                        {type === 'purchase' && 'Per nomor PO ERP (kunci tracing lintas sistem), terurut nilai IDR terbesar; dokumen sumber tampil sebagai info sekunder.'}
                        {type === 'open_po' && 'PO ERP status Divalidasi/Approved/Ordered/Diterima sebagian, terurut paling lama — umur besar tanpa progres = kandidat ditutup/dibereskan.'}
                        {type === 'pr_status' && 'Daftar Request PO (RPO) berstatus ini, terurut terbaru.'}
                        {type === 'ap' && 'Faktur belum lunas vendor ini, live dari Accurate, terurut paling telat. Vendor bersaldo kredit biasanya tanpa faktur outstanding — saldonya berasal dari uang muka / CN / kelebihan bayar.'}
                        {type === 'po_status' && 'Daftar PO berstatus ini, terurut terbaru, dengan progres penerimaan.'}
                        {(type === 'payable' || type === 'credit') && 'Saldo per vendor, live dari Accurate saat halaman dimuat.'}
                    </DialogDescription>
                </DialogHeader>

                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari vendor / nomor…" className="h-8 w-64" />

                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>
                ) : type === 'purchase' ? (
                    <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                        <TableHeader>
                            <TableRow>
                                <TableHead>PO (ERP)</TableHead>
                                <TableHead>Dok. Accurate</TableHead>
                                <TableHead>Tanggal</TableHead>
                                <TableHead>Principal / Vendor</TableHead>
                                <TableHead className="text-right">Nilai asli</TableHead>
                                <TableHead className="text-right">IDR</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fDocs.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Tidak ada dokumen.</TableCell></TableRow>}
                            {fDocs.map((d, i) => (
                                <TableRow key={`${d.po}-${i}`}>
                                    <TableCell className="font-medium whitespace-nowrap">
                                        {d.has_po ? d.po : <span className="text-muted-foreground" title="Baris lama tanpa nomor PO — ditampilkan nomor dokumennya">({d.po})</span>}
                                        <span className="ml-1 text-muted-foreground">({d.n_items})</span>
                                    </TableCell>
                                    <TableCell className="max-w-44 truncate text-muted-foreground" title={d.docs}>
                                        {d.has_po ? `${d.docs}${d.n_docs > 1 ? ` · ${d.n_docs} dok` : ''}` : '–'}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">{d.trans_date}</TableCell>
                                    <TableCell className="max-w-52 truncate" title={d.vendor}>{d.principal}{d.principal !== d.vendor && <span className="ml-1 text-muted-foreground">· {d.vendor}</span>}</TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap">{d.cur} {num(d.asli, 2)}</TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap font-medium">{num(d.idr)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : type === 'open_po' || type === 'po_status' ? (
                    <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                        <TableHeader>
                            <TableRow>
                                <TableHead>PO</TableHead>
                                <TableHead>Principal / Vendor</TableHead>
                                <TableHead>Tanggal</TableHead>
                                <TableHead className="text-right">Umur (hari)</TableHead>
                                {type === 'open_po' && <TableHead>Status ERP</TableHead>}
                                <TableHead>Progres Accurate</TableHead>
                                <TableHead className="text-right">Nilai</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fPos.length === 0 && <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Tidak ada PO.</TableCell></TableRow>}
                            {fPos.map((r) => (
                                <TableRow key={r.ref}>
                                    <TableCell className="font-medium whitespace-nowrap">{r.ref}</TableCell>
                                    <TableCell className="max-w-52 truncate" title={r.vendor}>{r.principal}</TableCell>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.tanggal}</TableCell>
                                    <TableCell className={`text-right tabular-nums ${r.umur > 90 ? 'font-semibold text-red-600 dark:text-red-400' : r.umur > 30 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{num(r.umur)}</TableCell>
                                    {type === 'open_po' && <TableCell><Badge variant="outline" className="text-[10px]">{r.status}</Badge></TableCell>}
                                    <TableCell className="whitespace-nowrap">
                                        {r.acc_status
                                            ? <span className={`text-[11px] ${r.acc_status === 'Terproses' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                                {r.acc_status}{r.acc_percent !== null && r.acc_percent > 0 && r.acc_percent < 100 ? ` ${num(r.acc_percent, 1)}%` : ''}
                                            </span>
                                            : <span className="text-muted-foreground/50 text-[11px]">tak ada di Accurate</span>}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap"><span className="mr-1 text-[10px] text-muted-foreground">{r.cur}</span>{num(r.total, 2)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : type === 'ap' ? (
                    <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Faktur</TableHead>
                                <TableHead>Tanggal</TableHead>
                                <TableHead>Jatuh Tempo</TableHead>
                                <TableHead className="text-right">Telat (hari)</TableHead>
                                <TableHead className="text-right">Total ({spec?.cur ?? ''})</TableHead>
                                <TableHead className="text-right">Sisa</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(aps ?? []).length === 0 && (
                                <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                                    Tidak ada faktur outstanding — saldo vendor ini berasal dari uang muka / CN / kelebihan bayar.
                                </TableCell></TableRow>
                            )}
                            {(aps ?? []).filter((r) => !s || r.number.toLowerCase().includes(s) || (r.bill_number ?? '').toLowerCase().includes(s)).map((r) => (
                                <TableRow key={r.number}>
                                    <TableCell className="font-medium whitespace-nowrap">{r.number}{r.bill_number && r.bill_number !== r.number && <span className="ml-1 text-muted-foreground">({r.bill_number})</span>}</TableCell>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.trans_date}</TableCell>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.due_date}</TableCell>
                                    <TableCell className={`text-right tabular-nums ${r.overdue !== null && r.overdue > 30 ? 'font-semibold text-red-600 dark:text-red-400' : r.overdue !== null && r.overdue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                        {r.overdue !== null && r.overdue > 0 ? num(r.overdue) : '–'}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap">{num(r.total, 2)}</TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap font-medium">{r.owing !== null ? num(r.owing, 2) : '–'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : type === 'pr_status' ? (
                    <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                        <TableHeader>
                            <TableRow>
                                <TableHead>RPO</TableHead>
                                <TableHead>Principal / Vendor</TableHead>
                                <TableHead>Tanggal</TableHead>
                                <TableHead className="text-right">Nilai (non-PPN)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fPrs.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Tidak ada RPO.</TableCell></TableRow>}
                            {fPrs.map((r) => (
                                <TableRow key={r.ref}>
                                    <TableCell className="font-medium whitespace-nowrap">{r.ref}</TableCell>
                                    <TableCell className="max-w-56 truncate" title={r.vendor}>{r.principal}</TableCell>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.tanggal}</TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap"><span className="mr-1 text-[10px] text-muted-foreground">{r.cur}</span>{num(r.total, 2)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Principal</TableHead>
                                <TableHead>Vendor (Accurate)</TableHead>
                                <TableHead className="text-right">Saldo asli</TableHead>
                                <TableHead className="text-right">± IDR</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fBal.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Tidak ada saldo.</TableCell></TableRow>}
                            {fBal.map((r) => (
                                <TableRow key={r.vendor}>
                                    <TableCell className="font-medium">{r.principal}</TableCell>
                                    <TableCell className="max-w-56 truncate text-muted-foreground" title={r.vendor}>{r.vendor}</TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap">{r.cur} {num(r.amount, 2)}</TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap font-medium">{num(r.idr)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </DialogContent>
        </Dialog>
    );
}

interface PoCostRow { po: string; principal: string | null; tanggal: string | null; goods: number; cost: number; tax: number; n_cost: number; rate_pct: number | null }

/**
 * Inti tab biaya impor: hierarki Principal → PO → baris biaya terkait.
 * Level 1: total per principal (n PO, nilai barang, biaya, pajak, total keluar, rate).
 * Level 2 (klik principal): daftar PO-nya. Level 3 (klik PO): baris biaya inline.
 */
/** Dropdown principal yang bisa dicari (ringan, tanpa lib tambahan). */
function PrincipalPicker({ principals, value, onChange }: { principals: string[]; value: string | null; onChange: (v: string | null) => void }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const s = q.trim().toLowerCase();
    const filtered = principals.filter((p) => !s || p.toLowerCase().includes(s));

    return (
        <div className="relative w-72">
            <button type="button" onClick={() => { setOpen((v) => !v); setQ(''); }}
                className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-sm shadow-xs transition-colors hover:bg-accent">
                <span className={value ? '' : 'text-muted-foreground'}>{value ?? '— semua principal —'}</span>
                <span className="text-muted-foreground">▾</span>
            </button>
            {open && (
                <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md">
                    <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ketik untuk mencari…" className="m-2 h-8 w-[calc(100%-1rem)]" />
                    <div className="max-h-64 overflow-y-auto pb-1">
                        <button type="button" onMouseDown={() => { onChange(null); setOpen(false); }}
                            className="block w-full px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent">— semua principal —</button>
                        {filtered.map((p) => (
                            <button key={p} type="button" onMouseDown={() => { onChange(p); setOpen(false); }}
                                className={`block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-accent ${p === value ? 'font-semibold text-primary' : ''}`}>{p}</button>
                        ))}
                        {filtered.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Tidak ketemu.</p>}
                    </div>
                </div>
            )}
        </div>
    );
}

function ImportPoCard({ data, principal }: { data: { rows: PoCostRow[]; unattributed: { cost: number; tax: number; n: number } } | null; principal: string | null }) {
    const [openPrincipals, setOpenPrincipals] = useState<Set<string>>(new Set());
    const [openPo, setOpenPo] = useState<string | null>(null);
    const [poLines, setPoLines] = useState<Record<string, ExpDetailRow[] | null>>({});
    const [q, setQ] = useState('');

    const togglePrincipal = (p: string) => setOpenPrincipals((prev) => {
        const nx = new Set(prev);
        if (nx.has(p)) nx.delete(p); else nx.add(p);
        return nx;
    });

    const togglePo = (po: string) => {
        const next = openPo === po ? null : po;
        setOpenPo(next);
        if (next && poLines[po] === undefined) {
            setPoLines((m) => ({ ...m, [po]: null }));
            fetch(route('dashboard.purchasing.import-cost-detail') + `?q=${encodeURIComponent(po)}`, { headers: { Accept: 'application/json' } })
                .then((r) => r.json())
                .then((d) => setPoLines((m) => ({ ...m, [po]: d.rows ?? [] })))
                .catch(() => setPoLines((m) => ({ ...m, [po]: [] })));
        }
    };

    const s = q.trim().toLowerCase();
    const groups = useMemo(() => {
        const rows = (data?.rows ?? [])
            .filter((r) => !principal || r.principal === principal)
            .filter((r) => !s || r.po.toLowerCase().includes(s) || (r.principal ?? '').toLowerCase().includes(s));
        const g = new Map<string, { principal: string; pos: PoCostRow[]; goods: number; cost: number; tax: number }>();
        for (const r of rows) {
            const key = r.principal ?? '(principal tak dikenal)';
            const cur = g.get(key) ?? { principal: key, pos: [], goods: 0, cost: 0, tax: 0 };
            cur.pos.push(r);
            cur.goods += r.goods; cur.cost += r.cost; cur.tax += r.tax;
            g.set(key, cur);
        }
        return [...g.values()].sort((a, b) => (b.cost + b.tax) - (a.cost + a.tax));
    }, [data, s, principal]);

    const tGoods = groups.reduce((a, g) => a + g.goods, 0);
    const tCost = groups.reduce((a, g) => a + g.cost, 0);
    const tTax = groups.reduce((a, g) => a + g.tax, 0);

    const numCell = (v: number, cls = '') => (
        <TableCell className={`text-right tabular-nums whitespace-nowrap ${cls}`}>{v ? num(v) : <span className="text-muted-foreground/40">–</span>}</TableCell>
    );
    const rateCell = (rate: number | null) => (
        <TableCell className={`text-right tabular-nums ${rate !== null && rate > 12 ? 'font-semibold text-red-600 dark:text-red-400' : ''}`}>
            {rate !== null ? `${num(rate, 2)}%` : '–'}
        </TableCell>
    );

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">Monitor Biaya Impor — Principal → PO → Biaya</CardTitle>
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari PO…" className="h-8 w-56" />
                </div>
                <p className="text-xs text-muted-foreground">
                    Klik principal untuk daftar PO-nya, klik PO untuk biaya-biaya terkaitnya. Nilai barang = realisasi faktur (IDR); biaya dialokasikan dari ref PO di catatan.
                    Principal yang impornya ditangani agen (mis. Asia Actual) biayanya melekat di harga faktur — tampil tanpa biaya terpisah, rate "–".
                    {data && data.unattributed.cost > 0 && ` Biaya tanpa ref PO: Rp ${num(data.unattributed.cost)} (${num(data.unattributed.n)} baris) — tak bisa dialokasikan.`}
                </p>
            </CardHeader>
            <CardContent>
                {data === null ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>
                ) : (
                    <div className="max-h-[36rem] overflow-y-auto">
                        <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                            <TableHeader className="sticky top-0 z-10 bg-card">
                                <TableRow>
                                    <TableHead>Principal / PO</TableHead>
                                    <TableHead className="text-right">PO</TableHead>
                                    <TableHead className="text-right">Nilai Barang (IDR)</TableHead>
                                    <TableHead className="text-right">Biaya Impor</TableHead>
                                    <TableHead className="text-right">Pajak</TableHead>
                                    <TableHead className="text-right">Total Keluar</TableHead>
                                    <TableHead className="text-right">Rate</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groups.length === 0 && <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Tidak ada data.</TableCell></TableRow>}
                                {groups.map((g) => {
                                    const open = principal !== null || openPrincipals.has(g.principal);
                                    return [
                                        <TableRow key={g.principal} className="cursor-pointer bg-muted/30 font-medium" onClick={() => togglePrincipal(g.principal)}>
                                            <TableCell className="whitespace-nowrap">
                                                <span className="mr-1.5 inline-block w-3 text-muted-foreground">{open ? '▾' : '▸'}</span>{g.principal}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{num(g.pos.length)}</TableCell>
                                            {numCell(g.goods)}
                                            {numCell(g.cost)}
                                            {numCell(g.tax)}
                                            {numCell(g.cost + g.tax, 'font-semibold')}
                                            {rateCell(g.goods > 0 ? Math.round(g.cost / g.goods * 10000) / 100 : null)}
                                        </TableRow>,
                                        ...(open ? g.pos.flatMap((r) => {
                                            const poOpen = openPo === r.po;
                                            const lines = poLines[r.po];
                                            return [
                                                <TableRow key={r.po} className="cursor-pointer" onClick={() => togglePo(r.po)}>
                                                    <TableCell className="whitespace-nowrap pl-8">
                                                        <span className="mr-1.5 inline-block w-3 text-muted-foreground">{poOpen ? '▾' : '▸'}</span>
                                                        <span className="font-medium">{r.po}</span>
                                                        {r.tanggal && <span className="ml-1.5 text-muted-foreground">{r.tanggal}</span>}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.n_cost > 0 ? `${r.n_cost} biaya` : ''}</TableCell>
                                                    {numCell(r.goods)}
                                                    {numCell(r.cost)}
                                                    {numCell(r.tax)}
                                                    {numCell(r.cost + r.tax, 'font-medium')}
                                                    {rateCell(r.rate_pct)}
                                                </TableRow>,
                                                ...(poOpen ? [
                                                    <TableRow key={`${r.po}-lines`}>
                                                        <TableCell colSpan={7} className="bg-muted/20 p-0">
                                                            {lines === null || lines === undefined ? (
                                                                <div className="flex items-center gap-2 px-10 py-3 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Memuat biaya…</div>
                                                            ) : lines.length === 0 ? (
                                                                <p className="px-10 py-3 text-muted-foreground">Tidak ada baris biaya yang menyebut PO ini.</p>
                                                            ) : (
                                                                <div className="space-y-0.5 py-2 pr-3 pl-14">
                                                                    {lines.map((l, i) => (
                                                                        <div key={i} className="flex items-center justify-between gap-3">
                                                                            <span className="min-w-0 truncate text-muted-foreground" title={`${l.doc_number} · ${l.account} · ${l.notes}`}>
                                                                                <Badge variant="outline" className="mr-1.5 text-[9px]">{l.kategori}</Badge>
                                                                                {l.doc_number} · {l.trans_date} · {l.vendor}
                                                                            </span>
                                                                            <span className="shrink-0 tabular-nums">{num(l.idr)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>,
                                                ] : []),
                                            ];
                                        }) : []),
                                    ];
                                })}
                                <TableRow className="border-t-2 font-semibold">
                                    <TableCell>Grand Total</TableCell>
                                    <TableCell className="text-right tabular-nums">{num(groups.reduce((a, g) => a + g.pos.length, 0))}</TableCell>
                                    {numCell(tGoods)}
                                    {numCell(tCost)}
                                    {numCell(tTax)}
                                    {numCell(tCost + tTax)}
                                    {rateCell(tGoods > 0 ? Math.round(tCost / tGoods * 10000) / 100 : null)}
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/** Drill baris biaya impor: daftar mentah (dokumen, vendor jasa, akun, catatan, nilai). */
function ImportDrillDialog({ spec, onClose }: { spec: ImpDrill | null; onClose: () => void }) {
    const [rows, setRows] = useState<ExpDetailRow[] | null>(null);
    const [q, setQ] = useState('');

    useEffect(() => {
        setRows(null); setQ('');
        if (!spec) return;
        fetch(route('dashboard.purchasing.import-cost-detail') + `?${new URLSearchParams(spec.params)}`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((d) => setRows(d.rows ?? []))
            .catch(() => setRows([]));
    }, [spec]);

    const s = q.trim().toLowerCase();
    const filtered = (rows ?? []).filter((r) => !s || r.doc_number.toLowerCase().includes(s) || r.vendor.toLowerCase().includes(s) || r.notes.toLowerCase().includes(s) || r.account.toLowerCase().includes(s));

    return (
        <Dialog open={spec !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
                <DialogHeader>
                    <DialogTitle>{spec?.label}</DialogTitle>
                    <DialogDescription>Baris biaya dari faktur pembelian, terurut nilai terbesar (maks 500). Kolom IDR memakai kurs bulan dokumen.</DialogDescription>
                </DialogHeader>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari dokumen / vendor / catatan…" className="h-8 w-72" />
                {rows === null ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>
                ) : (
                    <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Dokumen</TableHead>
                                <TableHead>Tanggal</TableHead>
                                <TableHead>Vendor Jasa</TableHead>
                                <TableHead>Akun</TableHead>
                                <TableHead>Kategori</TableHead>
                                <TableHead>Catatan</TableHead>
                                <TableHead className="text-right">IDR</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Tidak ada baris biaya.</TableCell></TableRow>}
                            {filtered.map((r, i) => (
                                <TableRow key={i}>
                                    <TableCell className="font-medium whitespace-nowrap">{r.doc_number}</TableCell>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.trans_date}</TableCell>
                                    <TableCell className="max-w-36 truncate" title={r.vendor}>{r.vendor}</TableCell>
                                    <TableCell className="max-w-36 truncate text-muted-foreground" title={r.account}>{r.account}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-[10px]">{r.kategori}</Badge></TableCell>
                                    <TableCell className="max-w-64 truncate text-muted-foreground" title={r.notes}>{r.notes}</TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap font-medium">{num(r.idr)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </DialogContent>
        </Dialog>
    );
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
interface Pivot { mode: 'year' | 'month'; currencies: string[]; rows: { period: string; cells: Record<string, number>; docs: number }[]; totals: Record<string, number> }

/**
 * Ringkasan pembelian ala pivot Excel: baris tahun × kolom mata uang (nilai ASLI);
 * klik tahun → pecah per bulan; klik bar principal di chart kiri → terfilter principal itu.
 */
function SpendPivotCard({ principal, onClear }: { principal: string | null; onClear: () => void }) {
    const [pivotYear, setPivotYear] = useState<string | null>(null);
    const [data, setData] = useState<Pivot | null>(null);

    useEffect(() => { setPivotYear(null); }, [principal]);
    useEffect(() => {
        setData(null);
        const params = new URLSearchParams();
        if (principal) params.set('principal', principal);
        if (pivotYear) params.set('year', pivotYear);
        fetch(route('dashboard.purchasing.spend-pivot') + `?${params}`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then(setData)
            .catch(() => setData({ mode: 'year', currencies: [], rows: [], totals: {} }));
    }, [principal, pivotYear]);

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">Summary Pembelian — {principal ?? 'Semua Principal'}</CardTitle>
                    <div className="flex gap-1.5">
                        {pivotYear && (
                            <button type="button" onClick={() => setPivotYear(null)}
                                className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent">← per tahun</button>
                        )}
                        {principal && (
                            <button type="button" onClick={onClear}
                                className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent">✕ semua principal</button>
                        )}
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">
                    Nilai asli per mata uang{pivotYear ? ` — per bulan ${pivotYear}` : ' — klik tahun untuk rincian per bulan'}.
                </p>
            </CardHeader>
            <CardContent>
                {data === null ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>
                ) : data.rows.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Tidak ada data.</p>
                ) : (
                    <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                        <TableHeader>
                            <TableRow>
                                <TableHead>{data.mode === 'year' ? 'Tahun' : 'Bulan'}</TableHead>
                                {data.currencies.map((c) => <TableHead key={c} className="text-right">{c}</TableHead>)}
                                <TableHead className="text-right">Dok</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.rows.map((r) => (
                                <TableRow key={r.period} className={data.mode === 'year' ? 'cursor-pointer' : ''}
                                    onClick={data.mode === 'year' ? () => setPivotYear(r.period) : undefined}>
                                    <TableCell className={`font-medium ${data.mode === 'year' ? 'text-primary' : ''}`}>
                                        {data.mode === 'year' ? r.period : BULAN[Number(r.period) - 1] ?? r.period}
                                    </TableCell>
                                    {data.currencies.map((c) => (
                                        <TableCell key={c} className="text-right tabular-nums whitespace-nowrap">
                                            {r.cells[c] !== undefined ? num(r.cells[c], 2) : <span className="text-muted-foreground/40">–</span>}
                                        </TableCell>
                                    ))}
                                    <TableCell className="text-right tabular-nums text-muted-foreground">{num(r.docs)}</TableCell>
                                </TableRow>
                            ))}
                            <TableRow className="border-t-2 font-semibold">
                                <TableCell>Grand Total</TableCell>
                                {data.currencies.map((c) => (
                                    <TableCell key={c} className="text-right tabular-nums whitespace-nowrap">{num(data.totals[c] ?? 0, 2)}</TableCell>
                                ))}
                                <TableCell className="text-right tabular-nums text-muted-foreground">{num(data.rows.reduce((s2, r) => s2 + r.docs, 0))}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}

function Kpi({ label, value, sub, onClick }: { label: string; value: string; sub?: string; onClick?: () => void }) {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag onClick={onClick} className={`rounded-lg border p-3.5 text-left ${onClick ? 'cursor-pointer transition-colors hover:bg-accent' : ''}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
            {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
        </Tag>
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

function StatusList({ title, rows, total, done, onPick }: { title: string; rows: StatusRow[]; total: number; done: number[]; onPick?: (r: StatusRow) => void }) {
    return (
        <div>
            <p className="mb-1.5 text-xs font-medium">{title} <span className="text-muted-foreground">({num(total)})</span></p>
            <div className="space-y-1">
                {rows.map((r) => (
                    <button key={r.statut} type="button" onClick={() => onPick?.(r)}
                        className="flex w-full items-center gap-2 rounded-sm text-left text-xs transition-colors hover:bg-accent">
                        <span className="w-32 shrink-0 truncate">{r.label}</span>
                        <div className="h-3.5 flex-1 overflow-hidden rounded-sm bg-muted/40">
                            <div className={`h-full rounded-sm ${done.includes(r.statut) ? 'bg-emerald-500/80' : r.statut >= 6 ? 'bg-red-400/70' : 'bg-sky-500/80'}`}
                                style={{ width: `${(r.n / Math.max(1, total)) * 100}%` }} />
                        </div>
                        <span className="w-10 shrink-0 text-right tabular-nums">{num(r.n)}</span>
                    </button>
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
