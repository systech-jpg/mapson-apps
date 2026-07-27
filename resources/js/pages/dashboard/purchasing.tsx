import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
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
    const [drill, setDrill] = useState<DrillSpec | null>(null);

    const chartData = [
        ...spending.rows.map((r) => ({ name: r.principal.length > 18 ? r.principal.slice(0, 17) + '…' : r.principal, full: r.principal, principal: r.principal, idr: r.idr })),
        ...(spending.others_n > 0 ? [{ name: `Lainnya (${spending.others_n})`, full: `${spending.others_n} vendor lain`, principal: undefined as string | undefined, idr: spending.others_idr }] : []),
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
                            <p className="text-xs text-muted-foreground">Nilai pembelian terkonversi IDR{year ? ` — ${year}` : ' — semua tahun'} · klik bar untuk rincian per PO.</p>
                        </CardHeader>
                        <CardContent className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                                    <XAxis type="number" tickFormatter={(v) => rp(v)} tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                                    <Tooltip formatter={(v: number) => [`Rp ${num(v)}`, 'Nilai']} labelFormatter={(_, p) => (p?.[0]?.payload?.full ?? '') as string} />
                                    <Bar dataKey="idr" fill="var(--primary)" radius={[0, 4, 4, 0]} className="cursor-pointer"
                                        onClick={(d: { payload?: { principal?: string } }) => d?.payload?.principal && setDrill({ type: 'purchase', principal: d.payload.principal })} />
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
                            <StatusList title="Request PO" rows={status.pr} total={status.pr_total} done={[2, 4]}
                                onPick={(r) => setDrill({ type: 'pr_status', statut: r.statut, label: `Request PO — ${r.label}` })} />
                            <StatusList title="Purchase Order" rows={status.po} total={status.po_total} done={[5]}
                                onPick={(r) => setDrill({ type: 'po_status', statut: r.statut, label: `PO — ${r.label}` })} />
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

            <KpiDrillDialog spec={drill} year={year} balances={balances} onClose={() => setDrill(null)} />
        </AppLayout>
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
