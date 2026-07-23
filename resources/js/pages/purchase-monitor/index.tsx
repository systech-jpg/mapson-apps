import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Head, Link } from '@inertiajs/react';
import { Settings, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

interface Principal {
    principal: string;
    is_mapped: boolean;
    years: Record<string, number>;
    currencies: Record<string, number>;
    total_idr: number;
    n: number;
}
interface Item {
    trans_date: string; doc_number: string | null; vendor_name: string | null; item_no: string | null;
    item_name: string | null; qty: number; unit: string | null; currency: string; asli: number; rate: number; idr: number;
}
interface Props {
    years: string[];
    principals: Principal[];
    summary: { total_idr: number; n_principal: number; n_mapped: number; n_lines: number };
    fx: { manual: number; external: number; default_rate: number };
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integrasi Data', href: '#' },
    { title: 'Monitoring Pembelian', href: '/integration/purchase-monitor' },
];

const rpC = (n: number) => {
    const x = Number(n || 0);
    const s = x < 0 ? '-' : '';
    const a = Math.abs(x);
    if (a >= 1e9) return s + 'Rp ' + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (a >= 1e6) return s + 'Rp ' + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return s + 'Rp ' + a.toLocaleString('id-ID');
};
const num = (n: number, d = 0) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: d });

export default function PurchaseMonitor({ years, principals, summary, fx }: Props) {
    const [q, setQ] = useState('');
    const [drill, setDrill] = useState<{ principal: string; year: string } | null>(null);

    const rows = useMemo(() => {
        const s = q.trim().toLowerCase();
        return s ? principals.filter((p) => p.principal.toLowerCase().includes(s)) : principals;
    }, [principals, q]);

    const yearTotal = (y: string) => rows.reduce((sum, p) => sum + (p.years[y] ?? 0), 0);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Monitoring Pembelian" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold">Monitoring Pembelian</h1>
                        <p className="text-sm text-muted-foreground">
                            Total pembelian per <b>principal</b> per <b>tahun</b> dari faktur pembelian Accurate. Nilai mata uang asing
                            dikonversi ke IDR memakai kurs per bulan. Klik sel untuk melihat detail item.
                        </p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1.5">
                        <Link href={route('purchase-monitor.settings')}><Settings className="size-3.5" /> Pengaturan</Link>
                    </Button>
                </div>

                {fx.external === 0 && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        <TriangleAlert className="size-4 shrink-0" />
                        <span>
                            Kurs masih <b>asumsi</b> (Rp {num(fx.default_rate)}/USD, {fx.manual} bulan manual). Jalankan
                            <code className="mx-1 rounded bg-amber-100 px-1 dark:bg-amber-900/40">php artisan fx:fetch</code>
                            di server untuk mengambil kurs historis sebenarnya.
                        </span>
                    </div>
                )}

                <div className="grid gap-3 sm:grid-cols-4">
                    <SumCard label="Total Pembelian (IDR)" value={rpC(summary.total_idr)} />
                    <SumCard label="Principal / Vendor" value={String(summary.n_principal)} sub={`${summary.n_mapped} ter-mapping ke principal`} />
                    <SumCard label="Baris Item" value={num(summary.n_lines)} />
                    <SumCard label="Kurs" value={`${fx.external + fx.manual} bulan`} sub={fx.external > 0 ? `${fx.external} dari lookup` : 'semua asumsi'} tone={fx.external === 0 ? 'warn' : undefined} />
                </div>

                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <CardTitle className="text-base">Pembelian per Principal × Tahun</CardTitle>
                            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari principal / vendor…" className="h-8 w-56" />
                        </div>
                        <p className="text-xs text-muted-foreground">{rows.length} principal · nilai dalam IDR terkonversi · klik sel untuk detail item.</p>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table className="text-sm [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Principal / Vendor</TableHead>
                                        <TableHead className="text-center">Mata Uang</TableHead>
                                        {years.map((y) => <TableHead key={y} className="text-right">{y}</TableHead>)}
                                        <TableHead className="text-right font-semibold">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((p) => (
                                        <TableRow key={p.principal}>
                                            <TableCell className="font-medium">
                                                {p.principal}
                                                {!p.is_mapped && <Badge variant="outline" className="ml-1.5 border-muted-foreground/40 text-[10px] text-muted-foreground">belum di-map</Badge>}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {Object.keys(p.currencies).map((c) => (
                                                    <Badge key={c} variant="outline" className={`ml-0.5 text-[10px] ${c === 'IDR' ? '' : 'border-sky-400 text-sky-600 dark:text-sky-400'}`}>{c}</Badge>
                                                ))}
                                            </TableCell>
                                            {years.map((y) => (
                                                <TableCell key={y} className="text-right tabular-nums">
                                                    {p.years[y] ? (
                                                        <button className="hover:underline" onClick={() => setDrill({ principal: p.principal, year: y })}>{rpC(p.years[y])}</button>
                                                    ) : <span className="text-muted-foreground/40">–</span>}
                                                </TableCell>
                                            ))}
                                            <TableCell className="text-right font-semibold tabular-nums">{rpC(p.total_idr)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <tfoot>
                                    <TableRow className="border-t-2 font-semibold">
                                        <TableCell colSpan={2}>Total ({rows.length} principal)</TableCell>
                                        {years.map((y) => <TableCell key={y} className="text-right tabular-nums">{rpC(yearTotal(y))}</TableCell>)}
                                        <TableCell className="text-right tabular-nums">{rpC(rows.reduce((s, p) => s + p.total_idr, 0))}</TableCell>
                                    </TableRow>
                                </tfoot>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {drill && <DrilldownDialog {...drill} onClose={() => setDrill(null)} />}
        </AppLayout>
    );
}

function DrilldownDialog({ principal, year, onClose }: { principal: string; year: string; onClose: () => void }) {
    const [items, setItems] = useState<Item[] | null>(null);
    const [q, setQ] = useState('');

    if (items === null) {
        fetch(route('purchase-monitor.drilldown') + '?principal=' + encodeURIComponent(principal) + '&year=' + year)
            .then((r) => r.json()).then((d) => setItems(d.items ?? []));
    }

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        return (items ?? []).filter((r) => !s || (r.item_name ?? '').toLowerCase().includes(s) || (r.item_no ?? '').toLowerCase().includes(s) || (r.doc_number ?? '').toLowerCase().includes(s));
    }, [items, q]);

    const totalIdr = filtered.reduce((s, r) => s + r.idr, 0);

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-5xl">
                <DialogHeader>
                    <DialogTitle className="text-base">{principal} · {year} — detail item pembelian</DialogTitle>
                </DialogHeader>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari item / no dokumen…" className="h-8" />
                <div className="max-h-[60vh] overflow-auto">
                    <Table className="text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:h-7 [&_th]:px-2">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tanggal</TableHead>
                                <TableHead>No Dok</TableHead>
                                <TableHead>Item</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">Nilai Asli</TableHead>
                                <TableHead className="text-right">Kurs</TableHead>
                                <TableHead className="text-right">IDR</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items === null ? (
                                <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Memuat…</TableCell></TableRow>
                            ) : filtered.map((r, i) => (
                                <TableRow key={i}>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.trans_date}</TableCell>
                                    <TableCell className="whitespace-nowrap font-mono">{r.doc_number}</TableCell>
                                    <TableCell className="max-w-[280px] truncate" title={r.item_name ?? ''}>
                                        <span className="font-mono text-[10px] text-muted-foreground">{r.item_no}</span> {r.item_name}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap">{num(r.qty, 2)} {r.unit}</TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap">{r.currency} {num(r.asli, 2)}</TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground">{r.currency === 'IDR' ? '–' : num(r.rate)}</TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap">{rpC(r.idr)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <tfoot>
                            <TableRow className="border-t-2 font-semibold">
                                <TableCell colSpan={6}>Total ({filtered.length} item)</TableCell>
                                <TableCell className="text-right tabular-nums">{rpC(totalIdr)}</TableCell>
                            </TableRow>
                        </tfoot>
                    </Table>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function SumCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
    return (
        <Card>
            <CardContent className="p-3.5">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`mt-1 text-xl font-bold ${tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : ''}`}>{value}</p>
                {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
            </CardContent>
        </Card>
    );
}
