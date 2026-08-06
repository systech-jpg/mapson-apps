import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type Paginated } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Database, FileSpreadsheet, LoaderCircle, Search, Upload } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integrasi Data', href: '#' },
    { title: 'Rekon vs Stocktake', href: '/stocktake-recon' },
];

interface Row {
    code: string;
    name: string | null;
    principal: string | null;
    erp_qty: number | string;
    acc_qty: number | string;
    st_qty: number | string;
    has_st: string | null;
    has_erp: string | null;
    has_acc: string | null;
    erp_vs_st: number | string;
    acc_vs_st: number | string;
}

interface ErpSession {
    id: number;
    ref: string;
    label: string;
    date: string | null;
    status: number;
    items: number;
    period: string;
}

interface Props {
    rows: Paginated<Row>;
    filters: { q: string; bucket: string };
    summary: { total: number; all_match: number; erp_diff: number; acc_diff: number; no_physical: number };
    meta: { counted_at: string | null; count: number; erp_snapshot: string | null; acc_snapshot: string | null; data_period: string | null };
    erp_sessions: ErpSession[];
}

const num = (v: unknown) => Number(v ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });

// Human-readable difference note vs the physical count (the baseline of truth).
const ket = (r: Row): { text: string; cls: string } => {
    if (!r.has_st) return { text: 'Belum ada hitung fisik', cls: 'text-muted-foreground' };
    const evs = Number(r.erp_vs_st);
    const avs = Number(r.acc_vs_st);
    const parts: string[] = [];
    if (!r.has_erp) parts.push('ERP: tidak ada');
    else if (evs !== 0) parts.push(`ERP ${evs > 0 ? 'lebih' : 'kurang'} ${num(Math.abs(evs))}`);
    if (!r.has_acc) parts.push('Manual Import: tidak ada');
    else if (avs !== 0) parts.push(`Manual Import ${avs > 0 ? 'lebih' : 'kurang'} ${num(Math.abs(avs))}`);
    if (parts.length === 0) return { text: 'Cocok', cls: 'text-emerald-600' };
    return { text: parts.join(' · '), cls: 'text-red-600' };
};

export default function StocktakeRecon({ rows, filters, summary, meta, erp_sessions }: Props) {
    const [q, setQ] = useState(filters.q ?? '');
    const [importOpen, setImportOpen] = useState(false);

    // Default to the stocktake session whose period matches the system data period.
    const matchSession = erp_sessions.find((s) => s.period === meta.data_period);
    const erpSync = useForm<{ fk_stocktake: string; truncate: boolean }>({
        fk_stocktake: matchSession ? String(matchSession.id) : erp_sessions[0] ? String(erp_sessions[0].id) : '',
        truncate: true,
    });
    const submitErpSync = () =>
        erpSync.post(route('stocktake.recon.sync-erp'), { preserveScroll: true, onSuccess: () => setImportOpen(false) });

    const go = (next: Record<string, unknown> = {}) =>
        router.get(route('stocktake.recon'), { q, bucket: filters.bucket || undefined, ...next }, { preserveState: true, replace: true });

    const exportParams = { q: q || undefined, bucket: filters.bucket || undefined };

    const imp = useForm<{ file: File | null; paste: string; counted_at: string; truncate: boolean }>({
        file: null,
        paste: '',
        counted_at: '',
        truncate: false,
    });
    const submitImport = () =>
        imp.post(route('stocktake.recon.import'), {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                setImportOpen(false);
                imp.reset();
            },
        });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Rekon System vs Stocktake" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">Rekon System vs Stocktake</h1>
                        <p className="text-sm text-muted-foreground">
                            ERP vs Manual Import vs hitung fisik (stocktake), dicocokkan via kode item.
                            {meta.count > 0
                                ? ` ${num(meta.count)} item fisik${meta.counted_at ? ` per ${meta.counted_at}` : ''}.`
                                : ' Belum ada data fisik — Import dulu.'}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Dialog open={importOpen} onOpenChange={setImportOpen}>
                            <DialogTrigger asChild>
                                <Button><Upload className="size-4" /> Import Stocktake</Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                                <DialogHeader><DialogTitle>Import Data Stocktake</DialogTitle></DialogHeader>
                                <div className="space-y-3">
                                    {/* Pull from ERP stocktake module (primary) */}
                                    <div className="rounded-md border bg-muted/30 p-3">
                                        <p className="mb-2 text-sm font-medium">Tarik dari ERP (Stock Opname)</p>
                                        {erp_sessions.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">Tidak ada sesi stocktake di ERP / koneksi ERP belum siap.</p>
                                        ) : (
                                            <div className="flex flex-wrap items-end gap-2">
                                                <div className="grid gap-1.5">
                                                    <Label className="text-xs">Sesi</Label>
                                                    <Select value={erpSync.data.fk_stocktake} onValueChange={(v) => erpSync.setData('fk_stocktake', v)}>
                                                        <SelectTrigger className="h-9 w-72"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            {erp_sessions.map((s) => (
                                                                <SelectItem key={s.id} value={String(s.id)}>
                                                                    {s.label} ({s.items} item){s.period === meta.data_period ? ' — periode data' : ''}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <label className="flex items-center gap-1.5 pb-2 text-sm">
                                                    <Checkbox checked={erpSync.data.truncate} onCheckedChange={(v) => erpSync.setData('truncate', v === true)} /> Ganti semua
                                                </label>
                                                <Button onClick={submitErpSync} disabled={erpSync.processing || !erpSync.data.fk_stocktake}>
                                                    {erpSync.processing ? <LoaderCircle className="size-4 animate-spin" /> : <Database className="size-4" />} Tarik
                                                </Button>
                                            </div>
                                        )}
                                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                                            Periode data (snapshot): <b>{meta.data_period ?? '—'}</b>. Disarankan tarik stocktake periode sama. Memakai <b>qty fisik</b> dari sesi terpilih.
                                        </p>
                                    </div>

                                    <div className="relative text-center text-[11px] text-muted-foreground"><span className="bg-background px-2">atau import manual</span><div className="absolute inset-x-0 top-1/2 -z-10 border-t" /></div>

                                    <p className="text-xs text-muted-foreground">
                                        Unggah <b>CSV</b> atau tempel data. Kolom minimal: <b>Kode</b> &amp; <b>Total/Qty</b> (opsional Nama, Principal).
                                        Baris berheader otomatis dikenali. Upsert per kode.
                                    </p>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="file">File CSV</Label>
                                        <Input id="file" type="file" accept=".csv,.txt" onChange={(e) => imp.setData('file', e.target.files?.[0] ?? null)} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="paste">…atau tempel di sini (Kode, Nama, Qty)</Label>
                                        <Textarea id="paste" rows={5} value={imp.data.paste} onChange={(e) => imp.setData('paste', e.target.value)} placeholder={'RPP3532,Reduction Poly Screw,16\nPO8580,Poly Pedicle Screw,10'} className="font-mono text-xs" />
                                    </div>
                                    <div className="flex flex-wrap items-end gap-3">
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="counted_at">Tanggal stocktake</Label>
                                            <Input id="counted_at" type="date" className="w-44" value={imp.data.counted_at} onChange={(e) => imp.setData('counted_at', e.target.value)} />
                                        </div>
                                        <label className="flex items-center gap-1.5 pb-2 text-sm">
                                            <Checkbox checked={imp.data.truncate} onCheckedChange={(v) => imp.setData('truncate', v === true)} /> Ganti semua (truncate)
                                        </label>
                                    </div>
                                    {imp.errors.file && <p className="text-xs text-red-600">{imp.errors.file}</p>}
                                    <div className="flex justify-end">
                                        <Button onClick={submitImport} disabled={imp.processing}>
                                            {imp.processing ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} Import
                                        </Button>
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                        <Button variant="outline" asChild>
                            <a href={route('stocktake.recon.export', exportParams)}><FileSpreadsheet className="size-4" /> Export</a>
                        </Button>
                    </div>
                </div>

                {/* Summary buckets (clickable → filter) */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {[
                        { key: '', label: 'Total Item', val: summary.total, cls: '' },
                        { key: 'all_match', label: 'Cocok Semua', val: summary.all_match, cls: 'text-emerald-600' },
                        { key: 'erp_diff', label: 'Beda ERP vs Fisik', val: summary.erp_diff, cls: 'text-red-600' },
                        { key: 'acc_diff', label: 'Beda Manual Import vs Fisik', val: summary.acc_diff, cls: 'text-amber-600' },
                        { key: 'no_physical', label: 'Tanpa Fisik', val: summary.no_physical, cls: 'text-muted-foreground' },
                    ].map((c) => (
                        <Card key={c.label} className={`cursor-pointer transition-colors hover:bg-accent/40 ${filters.bucket === c.key ? 'border-primary' : ''}`} onClick={() => go({ bucket: c.key || undefined })}>
                            <CardContent className="p-4">
                                <p className="text-xs text-muted-foreground">{c.label}</p>
                                <p className={`text-2xl font-bold ${c.cls}`}>{num(c.val)}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Search */}
                <div className="flex items-center gap-2">
                    <div className="relative max-w-sm flex-1">
                        <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="Cari kode / nama…" className="pl-8" />
                    </div>
                    <Button variant="outline" onClick={() => go()}>Cari</Button>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table className="[&_td]:px-3 [&_td]:py-1.5 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Kode</TableHead>
                                        <TableHead>Nama</TableHead>
                                        <TableHead className="text-right text-sky-600">ERP</TableHead>
                                        <TableHead className="text-right text-amber-600">Manual Import</TableHead>
                                        <TableHead className="text-right font-semibold">Fisik</TableHead>
                                        <TableHead className="text-right">ERP−Fisik</TableHead>
                                        <TableHead className="text-right">MI−Fisik</TableHead>
                                        <TableHead>Keterangan</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.data.length === 0 ? (
                                        <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Tidak ada data.</TableCell></TableRow>
                                    ) : rows.data.map((r) => {
                                        const evs = Number(r.erp_vs_st);
                                        const avs = Number(r.acc_vs_st);
                                        const k = ket(r);
                                        return (
                                            <TableRow key={r.code}>
                                                <TableCell className="font-medium whitespace-nowrap">{r.code}</TableCell>
                                                <TableCell className="max-w-[280px] truncate" title={r.name ?? ''}>{r.name}</TableCell>
                                                <TableCell className={`text-right whitespace-nowrap ${r.has_erp ? 'text-sky-600' : 'text-muted-foreground/40'}`}>{r.has_erp ? num(r.erp_qty) : '—'}</TableCell>
                                                <TableCell className={`text-right whitespace-nowrap ${r.has_acc ? 'text-amber-600' : 'text-muted-foreground/40'}`}>{r.has_acc ? num(r.acc_qty) : '—'}</TableCell>
                                                <TableCell className={`text-right font-semibold whitespace-nowrap ${r.has_st ? '' : 'text-muted-foreground/40'}`}>{r.has_st ? num(r.st_qty) : '—'}</TableCell>
                                                <TableCell className={`text-right whitespace-nowrap ${evs !== 0 ? 'font-semibold text-red-600' : 'text-emerald-600'}`}>{num(evs)}</TableCell>
                                                <TableCell className={`text-right whitespace-nowrap ${avs !== 0 ? 'font-semibold text-red-600' : 'text-emerald-600'}`}>{num(avs)}</TableCell>
                                                <TableCell className={`whitespace-nowrap text-xs ${k.cls}`}>{k.text}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Pagination links={rows.links} />
            </div>
        </AppLayout>
    );
}
