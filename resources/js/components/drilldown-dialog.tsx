import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

export type DrillFilter = Record<string, string | number>;

interface Row {
    id: number;
    invoice_no: string | null;
    invoice_date: string | null;
    customer: string | null;
    part_number: string | null;
    description: string | null;
    quantity: string | number | null;
    total: string | number | null;
    sales: string | null;
    paid_unpaid: string | null;
    disc?: string | number | null;
    disc_value?: string | number | null;
    dpp?: string | number | null;
    brutto?: string | number | null;
}

interface MonthFigure {
    ym: string;
    dpp: number;
    invoices: number;
    count: number;
    rows: Row[];
}

interface InvoiceItem {
    invoice_no: string | null;
    date: string | null;
    lines: number;
    total: number;
    status: string | null;
    erp_id: number | null;
}

interface CustomerGroup {
    customer: string;
    invoiceCount: number;
    total: number;
    dpp: number;
    invoices: InvoiceItem[];
}

interface Payload {
    title: string;
    mode?: string;
    summary: { count?: number; invoices?: number; customers?: number; dpp: number; total: number; brutto?: number; diskon?: number; net?: number };
    rows: { data: Row[]; current_page: number; last_page: number };
    compare?: { prev: MonthFigure; last: MonthFigure; diff: number; growth: number | null } | null;
    groups?: CustomerGroup[];
    collection?: { paid: number; unpaid: number; grand: number; rate: number; paidInvoices: number; unpaidInvoices: number } | null;
    customers?: { customer: string; dpp: number; total: number; invoices: number }[];
    aging?: { invoice_no: string | null; customer: string | null; inv_date: string | null; due_date: string | null; days_late: number | null; outstanding: number; lines: number }[];
}

function lateBadge(days: number | null) {
    if (days === null) return { label: '-', cls: 'bg-muted text-muted-foreground' };
    if (days <= 0) return { label: 'Belum jatuh tempo', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' };
    if (days <= 30) return { label: `${days} hari`, cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' };
    if (days <= 60) return { label: `${days} hari`, cls: 'bg-orange-200 text-orange-900 dark:bg-orange-950/60 dark:text-orange-300' };
    if (days <= 90) return { label: `${days} hari`, cls: 'bg-red-200 text-red-800 dark:bg-red-950/60 dark:text-red-300' };
    return { label: `${days} hari`, cls: 'bg-red-600 text-white' };
}

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtYm = (ym: string) => {
    const [y, m] = ym.split('-');
    return `${MONTHS_ID[Number(m) - 1]} ${y}`;
};
const pct = (n: number | null) => (n === null ? '–' : `${n >= 0 ? '+' : ''}${n}%`);
const rpC = (n: number) => {
    const x = Number(n || 0);
    if (Math.abs(x) >= 1e9) return 'Rp ' + (x / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (Math.abs(x) >= 1e6) return 'Rp ' + (x / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return 'Rp ' + x.toLocaleString('id-ID');
};
const money = (v: string | number | null) => Number(v ?? 0).toLocaleString('id-ID');

function RowsTable({ rows }: { rows: Row[] }) {
    return (
        <div className="overflow-x-auto rounded-md border">
            <Table className="text-xs [&_td]:px-3 [&_td]:py-1 [&_th]:h-8 [&_th]:px-3">
                <TableHeader>
                    <TableRow>
                        <TableHead className="whitespace-nowrap">Invoice</TableHead>
                        <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="whitespace-nowrap">Part</TableHead>
                        <TableHead>Deskripsi</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                        <TableHead>Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                                Tidak ada detail.
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((row) => (
                            <TableRow key={row.id}>
                                <TableCell className="font-medium whitespace-nowrap">{row.invoice_no}</TableCell>
                                <TableCell className="whitespace-nowrap">{row.invoice_date}</TableCell>
                                <TableCell className="max-w-[160px] truncate" title={row.customer ?? ''}>{row.customer}</TableCell>
                                <TableCell className="whitespace-nowrap">{row.part_number}</TableCell>
                                <TableCell className="max-w-[220px] truncate" title={row.description ?? ''}>{row.description}</TableCell>
                                <TableCell className="text-right">{Number(row.quantity ?? 0)}</TableCell>
                                <TableCell className="text-right whitespace-nowrap">{money(row.total)}</TableCell>
                                <TableCell>
                                    <Badge variant={row.paid_unpaid === 'PAID' ? 'default' : 'secondary'} className="px-1.5 py-0 text-[10px]">
                                        {row.paid_unpaid}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}

function DiscountTable({ rows }: { rows: Row[] }) {
    return (
        <div className="overflow-x-auto rounded-md border">
            <Table className="text-xs [&_td]:px-3 [&_td]:py-1 [&_th]:h-8 [&_th]:px-3">
                <TableHeader>
                    <TableRow>
                        <TableHead className="whitespace-nowrap">Invoice</TableHead>
                        <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="whitespace-nowrap">Part</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Brutto</TableHead>
                        <TableHead className="bg-amber-100 text-right whitespace-nowrap text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Diskon</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Total (Net)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Tidak ada detail.</TableCell>
                        </TableRow>
                    ) : (
                        rows.map((row) => (
                            <TableRow key={row.id}>
                                <TableCell className="font-medium whitespace-nowrap">{row.invoice_no}</TableCell>
                                <TableCell className="whitespace-nowrap">{row.invoice_date}</TableCell>
                                <TableCell className="max-w-[160px] truncate" title={row.customer ?? ''}>{row.customer}</TableCell>
                                <TableCell className="whitespace-nowrap">{row.part_number}</TableCell>
                                <TableCell className="text-right">{Number(row.quantity ?? 0)}</TableCell>
                                <TableCell className="text-right whitespace-nowrap">{money(row.brutto ?? null)}</TableCell>
                                <TableCell className="bg-amber-100/70 text-right font-semibold whitespace-nowrap text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                    {money(row.disc_value ?? null)}
                                    {Number(row.disc ?? 0) > 0 && <span className="ml-1 text-[10px] font-normal opacity-80">({Number(row.disc)}%)</span>}
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap">{money(row.dpp ?? null)}</TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}

function MonthBlock({ m, tone }: { m: MonthFigure; tone: 'last' | 'prev' }) {
    return (
        <div>
            <div className={`mb-1.5 flex flex-wrap items-baseline justify-between gap-2 rounded-md border-l-4 px-3 py-1.5 ${tone === 'last' ? 'border-primary bg-primary/5' : 'border-muted-foreground/40 bg-muted/40'}`}>
                <span className="font-semibold">{fmtYm(m.ym)}</span>
                <span className="text-sm">
                    DPP <b>{rpC(m.dpp)}</b> · {m.invoices} invoice · {m.count} baris
                </span>
            </div>
            <RowsTable rows={m.rows} />
            {m.count > m.rows.length && (
                <p className="mt-1 text-[11px] text-muted-foreground">Menampilkan {m.rows.length} transaksi terbesar dari {m.count}.</p>
            )}
        </div>
    );
}

export function DrilldownDialog({ filter, onClose }: { filter: DrillFilter | null; onClose: () => void }) {
    const [data, setData] = useState<Payload | null>(null);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);

    const filterKey = filter ? JSON.stringify(filter) : '';

    useEffect(() => {
        setPage(1);
    }, [filterKey]);

    useEffect(() => {
        if (!filter) return;
        const controller = new AbortController();
        setLoading(true);
        const params = new URLSearchParams();
        Object.entries(filter).forEach(([k, v]) => params.set(k, String(v)));
        params.set('page', String(page));
        fetch(`${route('dashboard.drilldown')}?${params.toString()}`, {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
            signal: controller.signal,
        })
            .then((r) => r.json())
            .then((json) => setData(json))
            .catch(() => {})
            .finally(() => setLoading(false));
        return () => controller.abort();
    }, [filterKey, page, filter]);

    const compare = data?.compare ?? null;

    return (
        <Dialog open={!!filter} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92vh] w-[96vw] max-w-7xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{data?.title ?? 'Detail'}</DialogTitle>
                    <DialogDescription>
                        {!data
                            ? 'Memuat...'
                            : data.mode === 'invoice-customer'
                              ? `${(data.summary.invoices ?? 0).toLocaleString('id-ID')} invoice · ${(data.summary.customers ?? 0).toLocaleString('id-ID')} customer · Total ${rpC(data.summary.total)}`
                              : data.mode === 'discount'
                                ? `${(data.summary.count ?? 0).toLocaleString('id-ID')} baris · Brutto ${rpC(data.summary.brutto ?? 0)} · Diskon ${rpC(data.summary.diskon ?? 0)} · Net ${rpC(data.summary.net ?? 0)}`
                                : data.mode === 'collection' && data.collection
                                  ? `Tertagih ${rpC(data.collection.paid)} dari total ${rpC(data.collection.grand)} (${data.collection.rate}%)`
                                  : data.mode === 'customers'
                                    ? `${(data.summary.count ?? 0).toLocaleString('id-ID')} customer · Total penjualan ${rpC(data.summary.dpp)}`
                                    : data.mode === 'aging'
                                      ? `${(data.summary.count ?? 0).toLocaleString('id-ID')} invoice · Outstanding ${rpC(data.summary.total)}`
                                      : `${(data.summary.count ?? 0).toLocaleString('id-ID')} baris · DPP ${rpC(data.summary.dpp)} · Total ${rpC(data.summary.total)}`}
                    </DialogDescription>
                </DialogHeader>

                {compare && (
                    <div className="grid gap-2 sm:grid-cols-3">
                        <div className="rounded-md border p-3">
                            <p className="text-xs text-muted-foreground">Pembanding · {fmtYm(compare.prev.ym)}</p>
                            <p className="text-lg font-bold">{rpC(compare.prev.dpp)}</p>
                            <p className="text-xs text-muted-foreground">{compare.prev.invoices} invoice</p>
                        </div>
                        <div className="rounded-md border p-3">
                            <p className="text-xs text-muted-foreground">Terbaru · {fmtYm(compare.last.ym)}</p>
                            <p className="text-lg font-bold">{rpC(compare.last.dpp)}</p>
                            <p className="text-xs text-muted-foreground">{compare.last.invoices} invoice</p>
                        </div>
                        <div className="rounded-md border bg-muted/40 p-3">
                            <p className="text-xs text-muted-foreground">Pertumbuhan (DPP)</p>
                            <p className={`text-2xl font-bold ${compare.growth === null ? '' : compare.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {pct(compare.growth)}
                            </p>
                            <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                                Selisih {rpC(compare.diff)}
                                <br />({rpC(compare.last.dpp)} − {rpC(compare.prev.dpp)}) ÷ {rpC(compare.prev.dpp)}
                            </p>
                        </div>
                    </div>
                )}

                {data?.collection && (
                    <div className="space-y-2">
                        <div className="grid gap-2 sm:grid-cols-3">
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Total Tagihan (semua periode)</p>
                                <p className="text-lg font-bold">{rpC(data.collection.grand)}</p>
                                <p className="text-xs text-muted-foreground">100% · {data.collection.paidInvoices + data.collection.unpaidInvoices} invoice</p>
                            </div>
                            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                                <p className="text-xs text-muted-foreground">Tertagih (PAID)</p>
                                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{rpC(data.collection.paid)}</p>
                                <p className="text-xs text-muted-foreground">{data.collection.rate}% · {data.collection.paidInvoices} invoice</p>
                            </div>
                            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                                <p className="text-xs text-muted-foreground">Belum Tertagih (UNPAID)</p>
                                <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{rpC(data.collection.unpaid)}</p>
                                <p className="text-xs text-muted-foreground">{Math.round((100 - data.collection.rate) * 10) / 10}% · {data.collection.unpaidInvoices} invoice</p>
                            </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Collection rate = {rpC(data.collection.paid)} ÷ {rpC(data.collection.grand)} = <b>{data.collection.rate}%</b>. Tabel di bawah = transaksi yang sudah tertagih (PAID).
                        </p>
                    </div>
                )}

                <div className="relative">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                            <LoaderCircle className="size-5 animate-spin" />
                        </div>
                    )}

                    {data?.mode === 'aging' ? (
                        <div className="overflow-x-auto rounded-md border">
                            <Table className="text-xs [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="whitespace-nowrap">Invoice</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead className="whitespace-nowrap">Tgl Invoice</TableHead>
                                        <TableHead className="whitespace-nowrap">Jatuh Tempo</TableHead>
                                        <TableHead className="whitespace-nowrap">Keterlambatan</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">Outstanding</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(data.aging ?? []).length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Tidak ada piutang di kategori ini.</TableCell>
                                        </TableRow>
                                    ) : (
                                        (data.aging ?? []).map((r) => {
                                            const b = lateBadge(r.days_late);
                                            return (
                                                <TableRow key={r.invoice_no}>
                                                    <TableCell className="font-medium whitespace-nowrap">{r.invoice_no}</TableCell>
                                                    <TableCell className="max-w-[180px] truncate" title={r.customer ?? ''}>{r.customer}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{r.inv_date}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{r.due_date ?? '-'}</TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${b.cls}`}>{b.label}</span>
                                                    </TableCell>
                                                    <TableCell className="text-right font-semibold whitespace-nowrap">{money(r.outstanding)}</TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    ) : data?.mode === 'customers' ? (
                        <div className="overflow-x-auto rounded-md border">
                            <Table className="text-xs [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8 text-right">#</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">Invoice</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">Total Penjualan</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(() => {
                                        const max = Math.max(...(data.customers ?? []).map((c) => c.dpp), 1);
                                        return (data.customers ?? []).map((c, i) => (
                                            <TableRow key={c.customer}>
                                                <TableCell className="text-right text-muted-foreground">{i + 1}</TableCell>
                                                <TableCell>
                                                    <div className="truncate font-medium" title={c.customer}>{c.customer}</div>
                                                    <div className="mt-0.5 h-1.5 w-full max-w-xs rounded bg-muted">
                                                        <div className="h-1.5 rounded bg-primary" style={{ width: `${(c.dpp / max) * 100}%` }} />
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">{c.invoices}</TableCell>
                                                <TableCell className="text-right font-semibold whitespace-nowrap">{money(c.dpp)}</TableCell>
                                            </TableRow>
                                        ));
                                    })()}
                                </TableBody>
                            </Table>
                        </div>
                    ) : data?.mode === 'invoice-customer' ? (
                        <div className="space-y-2">
                            {(data.groups ?? []).map((g) => (
                                <details key={g.customer} className="rounded-md border">
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent/40">
                                        <span className="truncate font-medium" title={g.customer}>{g.customer}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                            {g.invoiceCount} invoice · <b className="text-foreground">{rpC(g.total)}</b>
                                        </span>
                                    </summary>
                                    <div className="overflow-x-auto border-t">
                                        <Table className="text-xs [&_td]:px-3 [&_td]:py-1 [&_th]:h-8 [&_th]:px-3">
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="whitespace-nowrap">Invoice</TableHead>
                                                    <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                                                    <TableHead className="text-right">Baris</TableHead>
                                                    <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                                                    <TableHead>Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {g.invoices.map((iv) => (
                                                    <TableRow key={iv.invoice_no}>
                                                        <TableCell className="font-medium whitespace-nowrap">{iv.invoice_no}</TableCell>
                                                        <TableCell className="whitespace-nowrap">{iv.date}</TableCell>
                                                        <TableCell className="text-right">{iv.lines}</TableCell>
                                                        <TableCell className="text-right whitespace-nowrap">{money(iv.total)}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={iv.status === 'PAID' ? 'default' : 'secondary'} className="px-1.5 py-0 text-[10px]">
                                                                {iv.status}
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </details>
                            ))}
                        </div>
                    ) : compare ? (
                        <div className="grid gap-4 lg:grid-cols-2">
                            <MonthBlock m={compare.last} tone="last" />
                            <MonthBlock m={compare.prev} tone="prev" />
                        </div>
                    ) : (
                        <>
                            {data?.mode === 'discount' ? <DiscountTable rows={data?.rows.data ?? []} /> : <RowsTable rows={data?.rows.data ?? []} />}
                            {data && data.rows.last_page > 1 && (
                                <div className="mt-3 flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">
                                        Halaman {data.rows.current_page} dari {data.rows.last_page}
                                    </span>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                                            Sebelumnya
                                        </Button>
                                        <Button variant="outline" size="sm" disabled={page >= data.rows.last_page} onClick={() => setPage((p) => p + 1)}>
                                            Berikutnya
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
