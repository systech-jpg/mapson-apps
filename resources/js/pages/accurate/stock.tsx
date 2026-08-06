import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Database, Download, FileSpreadsheet, LoaderCircle, Search } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integrasi Data', href: '#' },
    { title: 'Manual Import', href: '#' },
    { title: 'Stok', href: '/integration/accurate/stock' },
];
const ALL = 'all';

interface Row {
    id: number;
    item_no: string | null;
    name: string | null;
    item_type: string | null;
    unit_price: string | number;
    quantity: string | number;
    available_to_sell: string | number;
}

interface Props {
    rows: { data: Row[]; links: { url: string | null; label: string; active: boolean }[]; total: number };
    filters: { q: string; type: string; in_stock: boolean };
    types: string[];
    count: number;
    lastSync: string | null;
    snapshotDate: string | null;
    today: string;
    ready: boolean;
}

const rp = (n: unknown) => 'Rp ' + Math.round(Number(n ?? 0)).toLocaleString('id-ID');
const num = (n: unknown) => Number(n ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });

export default function Stock({ rows, filters, types, count, lastSync, snapshotDate, today, ready }: Props) {
    const [q, setQ] = useState(filters.q ?? '');
    const sync = useForm({ snapshot_date: snapshotDate ?? today, truncate: false as boolean });

    const go = (next: Record<string, unknown> = {}) =>
        router.get(route('accurate.stock'), { q, type: filters.type || undefined, in_stock: filters.in_stock || undefined, ...next }, { preserveState: true, replace: true });
    const pull = () => sync.post(route('accurate.stock.sync'), { preserveScroll: true });
    const exportParams = { q, type: filters.type || undefined, in_stock: filters.in_stock || undefined };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Stok Manual Import" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">Stok Manual Import</h1>
                    <p className="text-sm text-muted-foreground">
                        Snapshot stok terkini per item (total semua gudang).
                        {snapshotDate ? ` Snapshot per: ${snapshotDate}.` : ''}
                        {lastSync ? ` Sinkron terakhir: ${lastSync}.` : ' Belum pernah ditarik.'} {count.toLocaleString('id-ID')} item.
                    </p>
                </div>

                {/* Aksi */}
                <Card>
                    <CardContent className="flex flex-wrap items-end gap-3 py-4">
                        <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">Tanggal snapshot (penanda)</label>
                            <Input type="date" className="w-40" value={sync.data.snapshot_date} onChange={(e) => sync.setData('snapshot_date', e.target.value)} />
                        </div>
                        <label className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm">
                            <Checkbox checked={sync.data.truncate} onCheckedChange={(v) => sync.setData('truncate', v === true)} />
                            Hapus data lama dulu (truncate)
                        </label>
                        <Button onClick={pull} disabled={!ready || sync.processing}>
                            {sync.processing ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                            {sync.processing ? 'Menarik…' : 'Tarik Stok'}
                        </Button>
                        <Button variant="outline" asChild>
                            <a href={route('accurate.stock.export', exportParams)}>
                                <FileSpreadsheet className="size-4" /> Export Excel
                            </a>
                        </Button>
                        {!ready && <span className="text-sm text-amber-600">Manual Import belum terhubung / API Host kosong — buka menu Setting dulu.</span>}
                        <span className="ml-auto text-xs text-muted-foreground">Snapshot = posisi stok saat ditarik (bukan per tanggal).</span>
                    </CardContent>
                </Card>

                {/* Filter */}
                <div className="flex flex-wrap items-center gap-2">
                    <Input
                        className="w-72"
                        placeholder="Cari kode / nama item…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && go()}
                    />
                    <Button variant="outline" size="icon" onClick={() => go()}><Search className="size-4" /></Button>
                    <Select value={filters.type || ALL} onValueChange={(v) => go({ type: v === ALL ? undefined : v })}>
                        <SelectTrigger className="w-44"><SelectValue placeholder="Semua tipe" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>Semua tipe</SelectItem>
                            {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1.5 text-sm">
                        <Checkbox checked={filters.in_stock} onCheckedChange={(v) => go({ in_stock: v === true ? true : undefined })} />
                        Hanya yang ada stok
                    </label>
                    <span className="ml-auto text-sm text-muted-foreground">{rows.total.toLocaleString('id-ID')} item</span>
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
                                        <TableHead>Tipe</TableHead>
                                        <TableHead className="text-right">Harga</TableHead>
                                        <TableHead className="text-right">Stok</TableHead>
                                        <TableHead className="text-right">Tersedia</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.data.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                                                <Database className="mx-auto mb-2 size-6 opacity-40" />
                                                Belum ada data. Klik "Tarik Stok Sekarang" untuk mengisi.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        rows.data.map((r) => (
                                            <TableRow key={r.id}>
                                                <TableCell className="whitespace-nowrap font-medium">{r.item_no ?? '—'}</TableCell>
                                                <TableCell>{r.name ?? '—'}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{r.item_type ?? '—'}</TableCell>
                                                <TableCell className="text-right whitespace-nowrap">{rp(r.unit_price)}</TableCell>
                                                <TableCell className={`text-right whitespace-nowrap font-medium ${Number(r.quantity) <= 0 ? 'text-muted-foreground' : ''}`}>{num(r.quantity)}</TableCell>
                                                <TableCell className="text-right whitespace-nowrap">{num(r.available_to_sell)}</TableCell>
                                            </TableRow>
                                        ))
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
