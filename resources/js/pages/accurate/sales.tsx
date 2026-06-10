import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Download, FileText, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integrasi Data', href: '#' },
    { title: 'Accurate', href: '#' },
    { title: 'Penjualan', href: '/integration/accurate/sales' },
];

interface Row {
    id: number | null;
    number: string | null;
    transDate: string | null;
    customer: string | null;
    total: number | string | null;
    status: string | null;
}

interface DetailLine {
    item_no: string | null;
    item_name: string | null;
    so_number: string | null;
    do_number: string | null;
    qty: number | string | null;
    unit: string | null;
    unit_price: number | string | null;
    gross: number | string | null;
    disc_percent: number | string | null;
    disc_amount: number | string | null;
    dpp: number | string | null;
    ppn: number | string | null;
    tax_name: string | null;
    total: number | string | null;
}

interface DetailData {
    header: { number: string; po_number: string | null; description: string | null; customer: string | null; status: string | null; trans_date: string | null; ship_date: string | null; dpp: number; ppn: number; total: number };
    lines: DetailLine[];
}

const money = (v: number | string | null) => Number(v ?? 0).toLocaleString('id-ID');

const firstDay = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const lastDay = () => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function AccurateSales({ ready, status }: { ready: boolean; status: { token: boolean; host: boolean; session: boolean } }) {
    const [from, setFrom] = useState(firstDay());
    const [to, setTo] = useState(lastDay());
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<Row[] | null>(null);
    const [meta, setMeta] = useState<{ page: number; pageCount: number; rowCount: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [detailOpen, setDetailOpen] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detail, setDetail] = useState<DetailData | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);

    const openDetail = (id: number) => {
        setDetailOpen(true);
        setDetail(null);
        setDetailError(null);
        setDetailLoading(true);
        fetch(route('accurate.sales.detail', id), {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
        })
            .then((r) => r.json())
            .then((j) => (j.ok ? setDetail({ header: j.header, lines: j.lines }) : setDetailError(j.message ?? 'Gagal memuat detail.')))
            .catch(() => setDetailError('Tidak bisa memuat detail.'))
            .finally(() => setDetailLoading(false));
    };

    const fetchData = (page = 1) => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ from, to, page: String(page) }).toString();
        fetch(`${route('accurate.sales.data')}?${params}`, {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
        })
            .then((r) => r.json())
            .then((j) => {
                if (j.ok) {
                    setRows(j.rows);
                    setMeta(j.meta);
                } else {
                    setRows([]);
                    setError(j.message ?? 'Gagal mengambil data.');
                }
            })
            .catch(() => setError('Tidak bisa memuat data.'))
            .finally(() => setLoading(false));
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Accurate — Penjualan" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">Penjualan Accurate</h1>
                    <p className="text-sm text-muted-foreground">Tarik data faktur penjualan dari Accurate per periode.</p>
                </div>

                {!ready && (
                    <Card>
                        <CardContent className="py-4 text-sm">
                            <p className="mb-1 text-amber-700 dark:text-amber-400">Belum siap menarik data. Status koneksi:</p>
                            <ul className="text-muted-foreground">
                                <li>{status.token ? '✅' : '❌'} Access Token {status.token ? 'ada' : 'belum (isi di Setting)'}</li>
                                <li>{status.host ? '✅' : '❌'} API Host {status.host ? 'ada' : 'belum — isi di Setting (mis. https://public.accurate.id)'}</li>
                                <li className="opacity-70">{status.session ? '✅' : 'ℹ️'} Session {status.session ? 'ada' : 'opsional (token API sudah termasuk sesi)'}</li>
                            </ul>
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardContent className="flex flex-wrap items-end gap-3 pt-6">
                        <div className="grid gap-1.5">
                            <Label htmlFor="from">Dari</Label>
                            <Input id="from" type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="to">Sampai</Label>
                            <Input id="to" type="date" className="w-44" value={to} onChange={(e) => setTo(e.target.value)} />
                        </div>
                        <Button onClick={() => fetchData(1)} disabled={loading || !ready}>
                            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                            Tarik Data
                        </Button>
                        {meta && <span className="ml-auto text-xs text-muted-foreground">Total {meta.rowCount.toLocaleString('id-ID')} faktur</span>}
                    </CardContent>
                </Card>

                {error && <p className="text-sm text-red-600">{error}</p>}

                {rows && (
                    <Card>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table className="text-sm [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-9 [&_th]:px-3">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-8 text-right">#</TableHead>
                                            <TableHead>Nomor</TableHead>
                                            <TableHead>Tanggal</TableHead>
                                            <TableHead>Customer</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                            <TableHead className="text-right">Aksi</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {rows.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Tidak ada faktur pada periode ini.</TableCell>
                                            </TableRow>
                                        ) : (
                                            rows.map((r, i) => (
                                                <TableRow key={r.id ?? i}>
                                                    <TableCell className="text-right text-muted-foreground">{(meta ? (meta.page - 1) * 100 : 0) + i + 1}</TableCell>
                                                    <TableCell className="font-medium whitespace-nowrap">{r.number}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{r.transDate}</TableCell>
                                                    <TableCell className="max-w-[260px] truncate" title={r.customer ?? ''}>{r.customer}</TableCell>
                                                    <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                                                    <TableCell className="text-right whitespace-nowrap">{money(r.total)}</TableCell>
                                                    <TableCell className="text-right">
                                                        {r.id != null && (
                                                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openDetail(r.id as number)}>
                                                                <FileText className="size-3.5" /> Detail
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {meta && meta.pageCount > 1 && (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Halaman {meta.page} dari {meta.pageCount}</span>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" disabled={meta.page <= 1 || loading} onClick={() => fetchData(meta.page - 1)}>Sebelumnya</Button>
                            <Button variant="outline" size="sm" disabled={meta.page >= meta.pageCount || loading} onClick={() => fetchData(meta.page + 1)}>Berikutnya</Button>
                        </div>
                    </div>
                )}
            </div>

            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="max-w-5xl w-[96vw]">
                    <DialogHeader>
                        <DialogTitle>Detail Faktur {detail?.header.number ?? ''}</DialogTitle>
                    </DialogHeader>

                    {detailLoading && (
                        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                            <LoaderCircle className="size-4 animate-spin" /> Memuat detail dari Accurate…
                        </div>
                    )}
                    {detailError && <p className="py-4 text-sm text-red-600">{detailError}</p>}

                    {detail && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                                <div><span className="text-muted-foreground">No PO:</span> {detail.header.po_number ?? '-'}</div>
                                <div><span className="text-muted-foreground">Tgl Faktur:</span> {detail.header.trans_date ?? '-'}</div>
                                <div><span className="text-muted-foreground">Tgl Kirim:</span> {detail.header.ship_date ?? '-'}</div>
                                <div><span className="text-muted-foreground">Status:</span> <Badge variant="secondary">{detail.header.status}</Badge></div>
                                <div className="col-span-2"><span className="text-muted-foreground">Keterangan:</span> {detail.header.description || '-'}</div>
                                <div className="col-span-2 sm:col-span-3"><span className="text-muted-foreground">Customer:</span> {detail.header.customer ?? '-'}</div>
                            </div>

                            <div className="overflow-x-auto rounded-md border">
                                <Table className="text-sm [&_td]:px-2 [&_td]:py-1.5 [&_th]:h-9 [&_th]:px-2">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Item</TableHead>
                                            <TableHead className="text-right">Qty</TableHead>
                                            <TableHead className="text-right">Harga</TableHead>
                                            <TableHead className="text-right">Bruto</TableHead>
                                            <TableHead className="text-right">Diskon</TableHead>
                                            <TableHead className="text-right">DPP</TableHead>
                                            <TableHead className="text-right">PPN</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {detail.lines.map((l, i) => (
                                            <TableRow key={i}>
                                                <TableCell>
                                                    <div className="font-medium">{l.item_name}</div>
                                                    {l.item_no && <div className="text-xs text-muted-foreground">{l.item_no}</div>}
                                                    {(l.so_number || l.do_number) && (
                                                        <div className="text-xs text-muted-foreground">
                                                            {l.so_number && <>SO: {l.so_number}</>}
                                                            {l.so_number && l.do_number && ' · '}
                                                            {l.do_number && <>DO: {l.do_number}</>}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right whitespace-nowrap">{money(l.qty)} {l.unit ?? ''}</TableCell>
                                                <TableCell className="text-right whitespace-nowrap">{money(l.unit_price)}</TableCell>
                                                <TableCell className="text-right whitespace-nowrap">{money(l.gross)}</TableCell>
                                                <TableCell className="text-right whitespace-nowrap">
                                                    {money(l.disc_amount)}
                                                    {Number(l.disc_percent) > 0 && <span className="text-xs text-muted-foreground"> ({l.disc_percent}%)</span>}
                                                </TableCell>
                                                <TableCell className="text-right whitespace-nowrap">{money(l.dpp)}</TableCell>
                                                <TableCell className="text-right whitespace-nowrap">{money(l.ppn)}</TableCell>
                                                <TableCell className="text-right font-medium whitespace-nowrap">{money(l.total)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            <div className="flex justify-end gap-6 text-sm">
                                <span><span className="text-muted-foreground">DPP:</span> {money(detail.header.dpp)}</span>
                                <span><span className="text-muted-foreground">PPN:</span> {money(detail.header.ppn)}</span>
                                <span className="font-semibold">Total: {money(detail.header.total)}</span>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
