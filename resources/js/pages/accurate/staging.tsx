import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { ChevronDown, ChevronRight, Database, Download, FileSpreadsheet, LoaderCircle, Search } from 'lucide-react';
import { Fragment, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integrasi Data', href: '#' },
    { title: 'Accurate', href: '#' },
    { title: 'Staging Data', href: '/integration/accurate/staging' },
];

type TabKey = 'invoices' | 'sales_orders' | 'delivery_orders';

interface Col {
    key: string;
    label: string;
    align?: 'right';
    money?: boolean;
}

const TABS: { key: TabKey; label: string }[] = [
    { key: 'invoices', label: 'Faktur' },
    { key: 'sales_orders', label: 'Sales Order' },
    { key: 'delivery_orders', label: 'Delivery Order' },
];

// Header columns per tab.
const COLUMNS: Record<TabKey, Col[]> = {
    invoices: [
        { key: 'number', label: 'No. Faktur' },
        { key: 'trans_date', label: 'Tanggal' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'po_number', label: 'PO Number' },
        { key: 'status_name', label: 'Status' },
        { key: 'dpp', label: 'DPP', align: 'right', money: true },
        { key: 'ppn', label: 'PPN', align: 'right', money: true },
        { key: 'total', label: 'Total', align: 'right', money: true },
    ],
    sales_orders: [
        { key: 'number', label: 'No. SO' },
        { key: 'trans_date', label: 'Tanggal' },
        { key: 'po_number', label: 'PO Number' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'status_name', label: 'Status' },
        { key: 'total', label: 'Total', align: 'right', money: true },
    ],
    delivery_orders: [
        { key: 'number', label: 'No. DO' },
        { key: 'trans_date', label: 'Tanggal' },
        { key: 'po_number', label: 'PO Number' },
        { key: 'customer_name', label: 'Customer' },
    ],
};

// Item (subgrid) columns per tab.
const ITEM_COLUMNS: Record<TabKey, Col[]> = {
    invoices: [
        { key: 'item_no', label: 'Kode' },
        { key: 'item_name', label: 'Item' },
        { key: 'qty', label: 'Qty', align: 'right' },
        { key: 'unit', label: 'Satuan' },
        { key: 'unit_price', label: 'Harga', align: 'right', money: true },
        { key: 'total', label: 'Total', align: 'right', money: true },
        { key: 'so_number', label: 'SO' },
        { key: 'do_number', label: 'DO' },
    ],
    sales_orders: [
        { key: 'item_no', label: 'Kode' },
        { key: 'item_name', label: 'Item' },
        { key: 'qty', label: 'Qty', align: 'right' },
        { key: 'unit', label: 'Satuan' },
        { key: 'unit_price', label: 'Harga', align: 'right', money: true },
        { key: 'total', label: 'Total', align: 'right', money: true },
    ],
    delivery_orders: [
        { key: 'item_no', label: 'Kode' },
        { key: 'item_name', label: 'Item' },
        { key: 'qty', label: 'Qty', align: 'right' },
        { key: 'unit', label: 'Satuan' },
        { key: 'so_number', label: 'SO' },
    ],
};

interface Paginator<T> {
    data: T[];
    links: { url: string | null; label: string; active: boolean }[];
    total: number;
}

type Row = Record<string, unknown> & { id: number; erp_id: number };

interface Props {
    tab: TabKey;
    rows: Paginator<Row>;
    items: Record<string, Row[]>;
    filters: { q: string; from: string; to: string };
    counts: Record<TabKey, number>;
    lastSync: string | null;
    ready: boolean;
}

const rp = (n: unknown) => 'Rp ' + Math.round(Number(n ?? 0)).toLocaleString('id-ID');
const cell = (v: unknown, c: Col) => {
    if (v === null || v === undefined || v === '') return <span className="text-muted-foreground/40">—</span>;
    if (c.money) return rp(v);
    return String(v);
};

export default function Staging({ tab, rows, items, filters, counts, lastSync, ready }: Props) {
    const [q, setQ] = useState(filters.q ?? '');
    const [open, setOpen] = useState<Set<number>>(new Set());
    const cols = COLUMNS[tab];
    const itemCols = ITEM_COLUMNS[tab];
    const sync = useForm<{ from: string; to: string; targets: string[] }>({ from: filters.from, to: filters.to, targets: ['faktur', 'so', 'do'] });
    const yr = (filters.to || filters.from || '').slice(0, 4) || '2026';
    const mv = useForm<{ from: string; to: string; truncate: boolean }>({ from: `${yr}-01-01`, to: filters.to, truncate: false });
    const pullMv = () => mv.post(route('accurate.staging.sync-movements'), { preserveScroll: true });

    const toggleTarget = (t: string) =>
        sync.setData('targets', sync.data.targets.includes(t) ? sync.data.targets.filter((x) => x !== t) : [...sync.data.targets, t]);
    const toggleRow = (id: number) =>
        setOpen((s) => {
            const n = new Set(s);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });

    const params = (next: Partial<{ tab: TabKey; q: string }> = {}) => ({ tab, q, from: sync.data.from, to: sync.data.to, ...next });
    const go = (next: Partial<{ tab: TabKey; q: string }> = {}) =>
        router.get(route('accurate.staging'), params(next), { preserveState: true, replace: true });
    const pull = () => sync.post(route('accurate.staging.sync'), { preserveScroll: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Staging Data Accurate" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">Staging Data Accurate</h1>
                    <p className="text-sm text-muted-foreground">
                        Data tarikan Accurate per periode. Klik baris untuk lihat item-nya (DO item = barang terkirim).
                        {lastSync ? ` Sinkron terakhir: ${lastSync}.` : ' Belum pernah ditarik.'}
                    </p>
                </div>

                {/* Periode + aksi */}
                <Card>
                    <CardContent className="flex flex-wrap items-end gap-3 py-4">
                        <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">Dari tanggal</label>
                            <Input type="date" className="w-40" value={sync.data.from} onChange={(e) => sync.setData('from', e.target.value)} />
                        </div>
                        <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">Sampai tanggal</label>
                            <Input type="date" className="w-40" value={sync.data.to} onChange={(e) => sync.setData('to', e.target.value)} />
                        </div>
                        <Button variant="outline" onClick={() => go()}>Terapkan Filter</Button>
                        <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                            <span className="text-xs text-muted-foreground">Tarik:</span>
                            {[{ k: 'faktur', l: 'Faktur' }, { k: 'so', l: 'Sales Order' }, { k: 'do', l: 'Delivery Order' }].map((t) => (
                                <label key={t.k} className="flex items-center gap-1.5 text-sm">
                                    <Checkbox checked={sync.data.targets.includes(t.k)} onCheckedChange={() => toggleTarget(t.k)} />
                                    {t.l}
                                </label>
                            ))}
                        </div>
                        <Button onClick={pull} disabled={!ready || sync.processing || sync.data.targets.length === 0}>
                            {sync.processing ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                            {sync.processing ? 'Menarik…' : 'Tarik dari Accurate'}
                        </Button>
                        <Button variant="outline" asChild>
                            <a href={route('accurate.staging.export', params())}>
                                <FileSpreadsheet className="size-4" /> Export Excel
                            </a>
                        </Button>
                        {!ready && <span className="text-sm text-amber-600">Accurate belum terhubung / API Host kosong — buka menu Setting dulu.</span>}
                        <span className="ml-auto text-xs text-muted-foreground">Periode besar bisa lama. Mulai dari rentang kecil.</span>
                    </CardContent>
                </Card>

                {/* Tarik mutasi stok per item (untuk Rekon & Kartu Stok) */}
                <Card>
                    <CardContent className="flex flex-wrap items-end gap-3 py-4">
                        <div className="mr-2 max-w-md">
                            <p className="text-sm font-medium">Tarik Mutasi Stok (Kartu Stok per Item)</p>
                            <p className="text-xs text-muted-foreground">
                                Rekonstruksi mutasi stok per item dari dokumen (DO, terima barang, retur, penyesuaian, faktur langsung) untuk Rekon Stok & Kartu Stok. Rentang setahun bisa ~10–15 menit.
                            </p>
                        </div>
                        <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">Dari</label>
                            <Input type="date" className="w-40" value={mv.data.from} onChange={(e) => mv.setData('from', e.target.value)} />
                        </div>
                        <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">Sampai</label>
                            <Input type="date" className="w-40" value={mv.data.to} onChange={(e) => mv.setData('to', e.target.value)} />
                        </div>
                        <label className="flex items-center gap-1.5 text-sm">
                            <Checkbox checked={mv.data.truncate} onCheckedChange={(v) => mv.setData('truncate', v === true)} /> Hapus dulu (truncate)
                        </label>
                        <Button onClick={pullMv} disabled={!ready || mv.processing}>
                            {mv.processing ? <LoaderCircle className="size-4 animate-spin" /> : <Database className="size-4" />}
                            {mv.processing ? 'Menarik…' : 'Tarik Mutasi Stok'}
                        </Button>
                        <span className="ml-auto text-xs text-muted-foreground">Rentang besar: jalankan per bulan, atau via <code>artisan accurate:sync-movements</code>.</span>
                    </CardContent>
                </Card>

                {/* Tabs */}
                <div className="flex flex-wrap gap-1 border-b">
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => go({ tab: t.key })}
                            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                                tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {t.label}
                            <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{counts[t.key] ?? 0}</span>
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="flex items-center gap-2">
                    <Input
                        className="w-72"
                        placeholder="Cari nomor / customer…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && go({ q })}
                    />
                    <Button variant="outline" size="icon" onClick={() => go({ q })}><Search className="size-4" /></Button>
                    <span className="text-sm text-muted-foreground">{rows.total.toLocaleString('id-ID')} dokumen</span>
                </div>

                {/* Table with item subgrid */}
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8" />
                                        {cols.map((c) => (
                                            <TableHead key={c.key} className={c.align === 'right' ? 'text-right' : ''}>{c.label}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.data.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={cols.length + 1} className="py-12 text-center text-muted-foreground">
                                                <Database className="mx-auto mb-2 size-6 opacity-40" />
                                                Belum ada data untuk filter ini. Klik "Tarik dari Accurate" untuk mengisi staging.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        rows.data.map((r) => {
                                            const its = items[String(r.erp_id)] ?? [];
                                            const expanded = open.has(r.erp_id);
                                            return (
                                                <Fragment key={r.erp_id}>
                                                    <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => toggleRow(r.erp_id)}>
                                                        <TableCell className="text-muted-foreground">
                                                            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                                        </TableCell>
                                                        {cols.map((c) => (
                                                            <TableCell key={c.key} className={c.align === 'right' ? 'text-right whitespace-nowrap' : ''}>
                                                                {cell(r[c.key], c)}
                                                            </TableCell>
                                                        ))}
                                                    </TableRow>
                                                    {expanded && (
                                                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                                                            <TableCell />
                                                            <TableCell colSpan={cols.length} className="p-0">
                                                                {its.length === 0 ? (
                                                                    <div className="px-3 py-3 text-xs text-muted-foreground">Tidak ada item.</div>
                                                                ) : (
                                                                    <div className="px-2 py-2">
                                                                        <Table className="text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:h-7 [&_th]:px-2">
                                                                            <TableHeader>
                                                                                <TableRow>
                                                                                    {itemCols.map((c) => (
                                                                                        <TableHead key={c.key} className={c.align === 'right' ? 'text-right' : ''}>{c.label}</TableHead>
                                                                                    ))}
                                                                                </TableRow>
                                                                            </TableHeader>
                                                                            <TableBody>
                                                                                {its.map((it) => (
                                                                                    <TableRow key={it.id}>
                                                                                        {itemCols.map((c) => (
                                                                                            <TableCell key={c.key} className={c.align === 'right' ? 'text-right whitespace-nowrap' : ''}>
                                                                                                {cell(it[c.key], c)}
                                                                                            </TableCell>
                                                                                        ))}
                                                                                    </TableRow>
                                                                                ))}
                                                                            </TableBody>
                                                                        </Table>
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </Fragment>
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
        </AppLayout>
    );
}
