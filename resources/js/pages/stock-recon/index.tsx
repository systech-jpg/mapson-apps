import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type Paginated } from '@/types';
import { Head, router } from '@inertiajs/react';
import { FileSpreadsheet, LoaderCircle, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integrasi Data', href: '#' },
    { title: 'Rekon Data Stok', href: '/stock-recon' },
];

interface Row {
    code: string;
    erp_label: string | null;
    acc_name: string | null;
    principal: string | null;
    erp_qty: string | number;
    acc_qty: string | number;
    selisih: string | number;
    erp_ref: string | null;
    acc_no: string | null;
    awal_selisih?: string | number;
    periode_selisih?: string | number;
}

interface Props {
    rows: Paginated<Row>;
    filters: { q: string; bucket: string; from: string };
    summary: { total: number; match: number; diff: number; only_erp: number; only_acc: number; p_bawaan: number | null; p_baru: number | null; p_campur: number | null };
    period: { from: string | null; options: string[] };
    snapshots: { erp: string | null; accurate: string | null };
}

const num = (v: unknown) => Number(v ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });

const BUCKETS = [
    { key: '', label: 'Semua' },
    { key: 'diff', label: 'Beda' },
    { key: 'match', label: 'Cocok' },
    { key: 'only_erp', label: 'Hanya ERP' },
    { key: 'only_acc', label: 'Hanya Manual Import' },
];

function status(r: Row): { label: string; cls: string } {
    if (r.erp_ref === null) return { label: 'Hanya Manual Import', cls: 'text-amber-600' };
    if (r.acc_no === null) return { label: 'Hanya ERP', cls: 'text-sky-600' };
    if (Number(r.selisih) === 0) return { label: 'Cocok', cls: 'text-emerald-600' };
    return { label: 'Beda', cls: 'text-red-600 font-semibold' };
}

interface DocAgg { doc: string; category: string; type?: string | null; qty: number; lines: number; date: string }
interface CardRow { date: string | null; number: string; type: string | null; masuk: number; keluar: number; lines: number; saldo: number }
interface Detail {
    code: string; label: string; selisih: number; year: number;
    erp: { qty: number; snapshot: string | null; exists: boolean; docs: DocAgg[] };
    accurate: {
        qty: number; snapshot: string | null; exists: boolean; docs: DocAgg[];
        movements_synced: string | null; has_movements: boolean;
        card: { opening: number; period_from: string | null; rows: CardRow[] };
    };
}

const d10 = (v: string | null) => (v ? String(v).substring(0, 10) : '-');
const ymOf = (d: string | null) => (d ? String(d).substring(0, 7) : '');
const CAT_LABEL: Record<string, string> = { DO: 'DO (keluar)', GR: 'Masuk/Beli', INV: 'Invoice (SI)', OTHER: 'Lainnya' };
const TYPE_LABEL: Record<string, string> = { DO: 'DO (kirim)', SI: 'Faktur Jual langsung', RI: 'Terima Barang', PI: 'Faktur Beli langsung', SR: 'Retur Jual', PR: 'Retur Beli', IA: 'Penyesuaian', SO: 'Pesanan Jual', PO: 'Pesanan Beli', IT: 'Transfer' };

export default function StockRecon({ rows, filters, summary, period, snapshots }: Props) {
    const [q, setQ] = useState(filters.q ?? '');
    const [detail, setDetail] = useState<Detail | null>(null);
    const [loading, setLoading] = useState(false);
    const [ym, setYm] = useState('all');
    const [movFilter, setMovFilter] = useState<'all' | 'DO' | 'GR' | 'INV' | 'OTHER'>('all');
    const [docQ, setDocQ] = useState('');
    const [view, setView] = useState<'kartu' | 'compare'>('kartu');

    const months = useMemo(
        () => detail
            ? Array.from(new Set([...detail.erp.docs, ...detail.accurate.docs].map((d) => ymOf(d.date)).filter(Boolean))).sort().reverse()
            : [],
        [detail],
    );

    const docFilter = (d: DocAgg) =>
        (movFilter === 'all' || d.category === movFilter) &&
        (ym === 'all' || ymOf(d.date) === ym) &&
        (docQ.trim() === '' || d.doc.toLowerCase().includes(docQ.trim().toLowerCase()));

    const erpShown = detail ? [...detail.erp.docs].filter(docFilter).sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
    const accShown = detail ? [...detail.accurate.docs].filter(docFilter).sort((a, b) => (a.date < b.date ? 1 : -1)) : [];

    // Align Manual Import & ERP by document number: same number → one row; one-sided → blank other side.
    const merged = useMemo(() => {
        const PH = '(tanpa dokumen)';
        const accMap = new Map<string, DocAgg>();
        accShown.forEach((d) => d.doc !== PH && accMap.set(d.doc, d));
        const erpMap = new Map<string, DocAgg>();
        erpShown.forEach((d) => d.doc !== PH && erpMap.set(d.doc, d));
        const keys = Array.from(new Set([...accMap.keys(), ...erpMap.keys()]));
        const rows: { doc: string; acc: DocAgg | null; erp: DocAgg | null }[] =
            keys.map((k) => ({ doc: k, acc: accMap.get(k) ?? null, erp: erpMap.get(k) ?? null }));
        accShown.filter((d) => d.doc === PH).forEach((d) => rows.push({ doc: PH, acc: d, erp: null }));
        erpShown.filter((d) => d.doc === PH).forEach((d) => rows.push({ doc: PH, acc: null, erp: d }));
        const dt = (r: { acc: DocAgg | null; erp: DocAgg | null }) => r.acc?.date || r.erp?.date || '';
        rows.sort((a, b) => (dt(a) < dt(b) ? 1 : -1));
        return rows;
    }, [erpShown, accShown]);

    const matchedCount = merged.filter((r) => r.acc && r.erp).length;
    const accOnly = merged.filter((r) => r.acc && !r.erp).length;
    const erpOnly = merged.filter((r) => !r.acc && r.erp).length;

    const go = (next: Record<string, unknown> = {}) =>
        router.get(route('stock.recon'), { q, bucket: filters.bucket || undefined, from: filters.from || undefined, ...next }, { preserveState: true, replace: true });

    // Bucket tambahan hanya bermakna dalam mode periode.
    const buckets = period.from
        ? [...BUCKETS, { key: 'p_bawaan', label: 'Bawaan Historis' }, { key: 'p_baru', label: 'Lahir di Periode' }, { key: 'p_campur', label: 'Campuran' }]
        : BUCKETS;

    const openDetail = (code: string) => {
        setLoading(true);
        setDetail(null);
        setYm('all');
        setMovFilter('all');
        setDocQ('');
        setView('kartu');
        fetch(route('stock.recon.detail', { code }), { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => setDetail(data))
            .finally(() => setLoading(false));
    };

    const exportParams = { q: q || undefined, bucket: filters.bucket || undefined, from: filters.from || undefined };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Rekon Data Stok ERP vs Manual Import" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">Rekon Data Stok — ERP vs Manual Import</h1>
                    <p className="text-sm text-muted-foreground">
                        Dicocokkan via kode item (ERP <code>ref</code> = Manual Import <code>item_no</code>).
                        {snapshots.erp ? ` Stok ERP per ${snapshots.erp}.` : ' Stok ERP belum ditarik.'}
                        {snapshots.accurate ? ` Stok Manual Import per ${snapshots.accurate}.` : ' Stok Manual Import belum ditarik.'}
                        {period.from && (
                            <> Dibanding snapshot <b>{period.from}</b>: kolom &quot;Awal&quot; = selisih yang sudah ada saat itu (mis. sebelum penyesuaian stok), &quot;Periode&quot; = selisih yang terbentuk setelahnya.</>
                        )}
                    </p>
                </div>

                {/* Summary cards (clickable → filter) */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {[
                        { key: '', label: 'Total Item', val: summary.total, cls: '' },
                        { key: 'diff', label: 'Selisih (Beda)', val: summary.diff, cls: 'text-red-600' },
                        { key: 'match', label: 'Cocok', val: summary.match, cls: 'text-emerald-600' },
                        { key: 'only_erp', label: 'Hanya ERP', val: summary.only_erp, cls: 'text-sky-600' },
                        { key: 'only_acc', label: 'Hanya Manual Import', val: summary.only_acc, cls: 'text-amber-600' },
                    ].map((c) => (
                        <Card
                            key={c.label}
                            className={`cursor-pointer transition-colors hover:bg-accent/40 ${filters.bucket === c.key ? 'border-primary' : ''}`}
                            onClick={() => go({ bucket: c.key || undefined })}
                        >
                            <CardContent className="p-4">
                                <p className="text-xs text-muted-foreground">{c.label}</p>
                                <p className={`mt-1 text-2xl font-bold ${c.cls}`}>{c.val.toLocaleString('id-ID')}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Mode periode: pecah item "Beda" menurut kapan selisihnya terbentuk */}
                {period.from && (
                    <div className="grid gap-3 sm:grid-cols-3">
                        {[
                            { key: 'p_bawaan', label: `Bawaan Historis (sudah beda sejak ${period.from})`, val: summary.p_bawaan ?? 0, cls: 'text-muted-foreground' },
                            { key: 'p_baru', label: 'Lahir di Periode Berjalan', val: summary.p_baru ?? 0, cls: 'text-red-600' },
                            { key: 'p_campur', label: 'Campuran (bawaan + bergeser lagi)', val: summary.p_campur ?? 0, cls: 'text-amber-600' },
                        ].map((c) => (
                            <Card
                                key={c.key}
                                className={`cursor-pointer transition-colors hover:bg-accent/40 ${filters.bucket === c.key ? 'border-primary' : ''}`}
                                onClick={() => go({ bucket: c.key })}
                            >
                                <CardContent className="p-4">
                                    <p className="text-xs text-muted-foreground">{c.label}</p>
                                    <p className={`mt-1 text-2xl font-bold ${c.cls}`}>{c.val.toLocaleString('id-ID')}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Filter bar */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Bandingkan sejak:</span>
                        <Select value={filters.from || '__none__'} onValueChange={(v) => go({ from: v === '__none__' ? undefined : v, bucket: undefined })}>
                            <SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">— tanpa pembanding —</SelectItem>
                                {period.options.map((d) => <SelectItem key={d} value={d}>snapshot {d}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-wrap gap-1 rounded-md border p-1">
                        {buckets.map((b) => (
                            <button
                                key={b.key}
                                onClick={() => go({ bucket: b.key || undefined })}
                                className={`rounded px-2.5 py-1 text-xs font-medium ${filters.bucket === b.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {b.label}
                            </button>
                        ))}
                    </div>
                    <Input className="w-64" placeholder="Cari kode / nama…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
                    <Button variant="outline" size="icon" onClick={() => go()}><Search className="size-4" /></Button>
                    <Button variant="outline" className="ml-auto" asChild>
                        <a href={route('stock.recon.export', exportParams)}><FileSpreadsheet className="size-4" /> Export Excel</a>
                    </Button>
                </div>

                {/* Table */}
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Kode</TableHead>
                                        <TableHead>Nama Item</TableHead>
                                        <TableHead>Principal</TableHead>
                                        <TableHead className="text-right">Qty ERP</TableHead>
                                        <TableHead className="text-right">Qty Manual Import</TableHead>
                                        <TableHead className="text-right">Selisih</TableHead>
                                        {period.from && <TableHead className="text-right whitespace-nowrap" title={`Selisih ERP−Manual Import pada snapshot ${period.from}`}>Awal ({period.from?.substring(5)})</TableHead>}
                                        {period.from && <TableHead className="text-right whitespace-nowrap" title="Selisih yang terbentuk SELAMA periode = selisih sekarang − selisih awal">Periode</TableHead>}
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.data.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={period.from ? 9 : 7} className="py-12 text-center text-muted-foreground">
                                                Tidak ada data. Pastikan stok ERP & Manual Import sudah ditarik.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        rows.data.map((r) => {
                                            const st = status(r);
                                            return (
                                                <TableRow key={r.code} className="cursor-pointer hover:bg-muted/30" onClick={() => openDetail(r.code)} title="Klik untuk telusur selisih">
                                                    <TableCell className="font-medium whitespace-nowrap">{r.code}</TableCell>
                                                    <TableCell className="max-w-[280px] truncate" title={String(r.erp_label ?? r.acc_name ?? '')}>{r.erp_label ?? r.acc_name ?? '—'}</TableCell>
                                                    <TableCell className="max-w-[140px] truncate" title={String(r.principal ?? '')}>{r.principal ?? '—'}</TableCell>
                                                    <TableCell className="text-right whitespace-nowrap">{r.erp_ref === null ? '—' : num(r.erp_qty)}</TableCell>
                                                    <TableCell className="text-right whitespace-nowrap">{r.acc_no === null ? '—' : num(r.acc_qty)}</TableCell>
                                                    <TableCell className={`text-right whitespace-nowrap ${Number(r.selisih) !== 0 ? 'font-semibold text-red-600' : 'text-muted-foreground'}`}>{num(r.selisih)}</TableCell>
                                                    {period.from && (
                                                        <TableCell className={`text-right whitespace-nowrap ${Number(r.awal_selisih ?? 0) !== 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>{num(r.awal_selisih)}</TableCell>
                                                    )}
                                                    {period.from && (
                                                        <TableCell className={`text-right whitespace-nowrap ${Number(r.periode_selisih ?? 0) !== 0 ? 'font-semibold text-red-600' : 'text-muted-foreground'}`}>{num(r.periode_selisih)}</TableCell>
                                                    )}
                                                    <TableCell className={`whitespace-nowrap text-xs ${st.cls}`}>{st.label}</TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Pagination links={rows.links} />
            </div>

            {/* Drill-down: telusur selisih */}
            <Dialog open={loading || !!detail} onOpenChange={(o) => !o && setDetail(null)}>
                <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Telusur Selisih — {detail?.code ?? ''}</DialogTitle>
                    </DialogHeader>

                    {loading ? (
                        <div className="flex h-40 items-center justify-center text-muted-foreground"><LoaderCircle className="size-6 animate-spin" /></div>
                    ) : detail ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm text-muted-foreground">{detail.label}</p>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                    <span>Stok ERP: <b className="text-sky-600">{num(detail.erp.qty)}</b></span>
                                    <span>Stok Manual Import: <b className="text-amber-600">{num(detail.accurate.qty)}</b></span>
                                    <span>Selisih: <b className={detail.selisih !== 0 ? 'text-red-600' : 'text-emerald-600'}>{num(detail.selisih)}</b></span>
                                </div>
                            </div>

                            {/* View toggle */}
                            <div className="flex w-fit gap-1 rounded-md border p-1">
                                <button onClick={() => setView('kartu')} className={`rounded px-3 py-1 text-xs font-medium ${view === 'kartu' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Kartu Stok Manual Import</button>
                                <button onClick={() => setView('compare')} className={`rounded px-3 py-1 text-xs font-medium ${view === 'compare' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Bandingkan ERP vs Manual Import</button>
                            </div>

                            {/* ── KARTU STOK ACCURATE ── */}
                            {view === 'kartu' && (
                                <div className="space-y-2">
                                    <p className="text-[11px] text-muted-foreground">
                                        Asal angka stok Manual Import <b>{num(detail.accurate.qty)}</b>: <b>Saldo awal {detail.year}</b>
                                        {detail.accurate.card.period_from ? ` (per ${d10(detail.accurate.card.period_from)})` : ''} + seluruh dokumen {detail.year} (DO/retur/penyesuaian/penerimaan) → saldo akhir.
                                        Direkonstruksi dari detail dokumen Manual Import (per-item, bundle di-explode, faktur dari DO tidak dihitung ulang).
                                        {detail.accurate.movements_synced && <> Terakhir tarik: {d10(detail.accurate.movements_synced)}.</>}
                                    </p>
                                    {!detail.accurate.has_movements && (
                                        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                            Mutasi {detail.year} untuk item ini <b>belum ditarik</b>. Buka <b>Integrasi Data → Manual Import → Staging</b> dan jalankan <b>Tarik Mutasi Stok {detail.year}</b> dulu (atau <code>php artisan accurate:sync-movements {detail.year}-01-01 {detail.year}-12-31</code>).
                                        </p>
                                    )}
                                    <div className="max-h-[64vh] overflow-auto rounded border">
                                        <Table className="text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:px-2">
                                            <TableHeader className="sticky top-0 z-10 bg-background">
                                                <TableRow>
                                                    <TableHead>Tgl</TableHead>
                                                    <TableHead>No. Dokumen</TableHead>
                                                    <TableHead>Tipe</TableHead>
                                                    <TableHead className="text-right">Masuk</TableHead>
                                                    <TableHead className="text-right">Keluar</TableHead>
                                                    <TableHead className="text-right">Saldo</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                <TableRow className="bg-muted/40 font-medium">
                                                    <TableCell className="whitespace-nowrap">{detail.accurate.card.period_from ? d10(detail.accurate.card.period_from) : '—'}</TableCell>
                                                    <TableCell colSpan={4}>Saldo awal {detail.year} (hasil tahun sebelumnya)</TableCell>
                                                    <TableCell className="text-right whitespace-nowrap">{num(detail.accurate.card.opening)}</TableCell>
                                                </TableRow>
                                                {detail.accurate.card.rows.length === 0 ? (
                                                    <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">{detail.accurate.exists ? 'Tidak ada mutasi.' : 'Item tidak ada di Manual Import.'}</TableCell></TableRow>
                                                ) : detail.accurate.card.rows.map((r, i) => (
                                                    <TableRow key={i} className={docQ.trim() !== '' && r.number.toLowerCase().includes(docQ.trim().toLowerCase()) ? 'bg-yellow-100 dark:bg-yellow-900/30' : ''}>
                                                        <TableCell className="whitespace-nowrap">{d10(r.date)}</TableCell>
                                                        <TableCell className="whitespace-nowrap font-medium">{r.number}{r.lines > 1 && <span className="ml-1 text-[10px] text-muted-foreground">×{r.lines}</span>}</TableCell>
                                                        <TableCell className="whitespace-nowrap text-muted-foreground">{r.type ? (TYPE_LABEL[r.type] ?? r.type) : '-'}</TableCell>
                                                        <TableCell className="text-right whitespace-nowrap text-emerald-600">{r.masuk ? num(r.masuk) : ''}</TableCell>
                                                        <TableCell className="text-right whitespace-nowrap text-red-600">{r.keluar ? num(r.keluar) : ''}</TableCell>
                                                        <TableCell className="text-right whitespace-nowrap font-medium">{num(r.saldo)}</TableCell>
                                                    </TableRow>
                                                ))}
                                                <TableRow className="border-t bg-muted/30 font-medium">
                                                    <TableCell colSpan={3} className="text-right">Total mutasi {detail.year}</TableCell>
                                                    <TableCell className="text-right whitespace-nowrap text-emerald-600">{num(detail.accurate.card.rows.reduce((s, r) => s + r.masuk, 0))}</TableCell>
                                                    <TableCell className="text-right whitespace-nowrap text-red-600">{num(detail.accurate.card.rows.reduce((s, r) => s + r.keluar, 0))}</TableCell>
                                                    <TableCell />
                                                </TableRow>
                                                <TableRow className="border-t-2 bg-muted/60 font-semibold">
                                                    <TableCell colSpan={5}>Saldo akhir (= stok Manual Import)</TableCell>
                                                    <TableCell className="text-right whitespace-nowrap text-amber-600">{num(detail.accurate.qty)}</TableCell>
                                                </TableRow>
                                            </TableBody>
                                        </Table>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="relative">
                                            <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                            <Input value={docQ} onChange={(e) => setDocQ(e.target.value)} placeholder="Sorot no. dokumen…" className="h-8 w-56 pl-7 text-xs" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── BANDINGKAN ERP vs ACCURATE ── */}
                            {view === 'compare' && (<>
                            {/* Filters: category · month · doc search */}
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex w-fit gap-1 rounded-md border p-1">
                                    {(['all', 'DO', 'GR', 'INV', 'OTHER'] as const).map((k) => (
                                        <button key={k} onClick={() => setMovFilter(k)} className={`rounded px-2.5 py-1 text-xs font-medium ${movFilter === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                                            {k === 'all' ? 'Semua' : CAT_LABEL[k] ?? k}
                                        </button>
                                    ))}
                                </div>
                                <Select value={ym} onValueChange={setYm}>
                                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Semua bulan</SelectItem>
                                        {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <div className="relative">
                                    <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <Input value={docQ} onChange={(e) => setDocQ(e.target.value)} placeholder="Cari no. dokumen…" className="h-8 w-48 pl-7 text-xs" />
                                </div>
                            </div>

                            <p className="text-[11px] text-muted-foreground">
                                Disejajarkan per <b>nomor dokumen</b>: nomor yang sama → satu baris (kiri Manual Import, kanan ERP); yang hanya ada di satu sisi → sisi lain kosong. Qty negatif = keluar, positif = masuk; <b className="text-red-600">merah</b> bila qty beda. Nomor DO/SJ biasanya sama; pembelian (RI/GRPO) sering beda penomoran.{' '}
                                <span className="text-emerald-600">{matchedCount} cocok</span> · <span className="text-amber-600">{accOnly} hanya Manual Import</span> · <span className="text-sky-600">{erpOnly} hanya ERP</span>
                            </p>

                            <div className="max-h-[62vh] overflow-auto rounded border">
                                <Table className="text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:px-2">
                                    <TableHeader className="sticky top-0 z-10 bg-background">
                                        <TableRow>
                                            <TableHead colSpan={3} className="border-r text-amber-600">TRANSAKSI ACCURATE</TableHead>
                                            <TableHead colSpan={3} className="text-sky-600">TRANSAKSI ERP</TableHead>
                                        </TableRow>
                                        <TableRow>
                                            <TableHead>Tgl</TableHead><TableHead>Dokumen</TableHead><TableHead className="border-r text-right">Qty</TableHead>
                                            <TableHead>Tgl</TableHead><TableHead>Dokumen</TableHead><TableHead className="text-right">Qty</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {merged.length === 0 ? (
                                            <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Tidak ada transaksi (filter).</TableCell></TableRow>
                                        ) : merged.map((r, i) => {
                                            const diff = r.acc && r.erp && Math.abs(r.acc.qty - r.erp.qty) > 0.001;
                                            const hl = docQ.trim() !== '' && r.doc.toLowerCase().includes(docQ.trim().toLowerCase());
                                            const qc = (d: DocAgg) => (diff ? 'text-red-600' : d.qty < 0 ? 'text-red-600' : 'text-emerald-600');
                                            return (
                                                <TableRow key={i} className={diff ? 'bg-yellow-100 dark:bg-yellow-900/40' : hl ? 'bg-sky-50 dark:bg-sky-950/40' : ''}>
                                                    {r.acc ? (
                                                        <>
                                                            <TableCell className="whitespace-nowrap">{d10(r.acc.date)}</TableCell>
                                                            <TableCell className="whitespace-nowrap font-medium" title={CAT_LABEL[r.acc.category] ?? r.acc.category}>{r.acc.doc}</TableCell>
                                                            <TableCell className={`border-r text-right font-medium whitespace-nowrap ${qc(r.acc)}`}>{num(r.acc.qty)}</TableCell>
                                                        </>
                                                    ) : (
                                                        <TableCell colSpan={3} className="border-r bg-muted/20" />
                                                    )}
                                                    {r.erp ? (
                                                        <>
                                                            <TableCell className="whitespace-nowrap">{d10(r.erp.date)}</TableCell>
                                                            <TableCell className="whitespace-nowrap font-medium" title={CAT_LABEL[r.erp.category] ?? r.erp.category}>{r.erp.doc}</TableCell>
                                                            <TableCell className={`text-right font-medium whitespace-nowrap ${qc(r.erp)}`}>{num(r.erp.qty)}</TableCell>
                                                        </>
                                                    ) : (
                                                        <TableCell colSpan={3} className="bg-muted/20" />
                                                    )}
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                            </>)}
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
