import { DrilldownDialog, type DrillFilter } from '@/components/drilldown-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import DashboardLayout from '@/layouts/dashboard-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Finance', href: '/dashboard/finance' }];

interface Bar {
    label: string;
    value: number;
}

interface Debtor {
    customer: string;
    outstanding: number;
    overdue: number;
    oldest: number;
}

interface Props {
    hasData: boolean;
    years: string[];
    year: string;
    kpi: { invoices: number; aov: number; overdue: number; overduePct: number; dso: number | null; ppnYtd: number };
    ar: { paid: number; outstanding: number; collectionRate: number; aging: Bar[] };
    forecast: Bar[];
    topDebtors: Debtor[];
    trend: { month: string; invoiced: number; collected: number }[];
    termin: { composition: Bar[]; onTimeRate: number | null; paidWithDates: number };
    ppnTrend: { month: string; value: number }[];
}

const AGING_KEYS = ['belum', '1-30', '31-60', '61-90', '90plus'];

const rpC = (n: number) => {
    const x = Number(n || 0);
    if (Math.abs(x) >= 1e9) return 'Rp ' + (x / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (Math.abs(x) >= 1e6) return 'Rp ' + (x / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return 'Rp ' + x.toLocaleString('id-ID');
};

function Kpi({ label, value, sub, accent, danger, onClick }: { label: string; value: string; sub?: React.ReactNode; accent?: boolean; danger?: boolean; onClick?: () => void }) {
    const tone = danger ? 'border-red-300 dark:border-red-900' : accent ? 'border-amber-300 dark:border-amber-800' : '';
    const valTone = danger ? 'text-red-600 dark:text-red-400' : accent ? 'text-amber-600 dark:text-amber-400' : '';
    return (
        <Card className={`${tone} ${onClick ? 'cursor-pointer transition-colors hover:bg-accent/40' : ''}`} onClick={onClick}>
            <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`mt-1 text-2xl font-bold ${valTone}`}>{value}</p>
                {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
            </CardContent>
        </Card>
    );
}

function BarList({ items, color = 'bg-amber-500', total, onItem }: { items: Bar[]; color?: string; total?: number; onItem?: (item: Bar, index: number) => void }) {
    const max = Math.max(...items.map((i) => i.value), 1);
    if (items.length === 0 || items.every((i) => i.value === 0)) return <p className="text-sm text-muted-foreground">Tidak ada data.</p>;
    return (
        <div className="space-y-2">
            {items.map((it, idx) => {
                const share = total && total > 0 ? (it.value / total) * 100 : null;
                return (
                    <div key={it.label + idx} className={onItem ? 'cursor-pointer rounded p-1 -mx-1 hover:bg-accent/50' : ''} onClick={onItem ? () => onItem(it, idx) : undefined}>
                        <div className="flex justify-between gap-2 text-xs">
                            <span className="truncate" title={it.label}>{it.label}</span>
                            <span className="shrink-0 font-medium">
                                {rpC(it.value)}
                                {share !== null && <span className="ml-1 font-normal text-muted-foreground">· {share.toFixed(1)}%</span>}
                            </span>
                        </div>
                        <div className="mt-0.5 h-2 w-full rounded bg-muted">
                            <div className={`h-2 rounded ${color}`} style={{ width: `${(it.value / max) * 100}%` }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function TrendBars({ trend }: { trend: Props['trend'] }) {
    const max = Math.max(...trend.flatMap((t) => [t.invoiced, t.collected]), 1);
    return (
        <div>
            <div className="mb-2 flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-muted-foreground/40" /> Tagihan (invoice)</span>
                <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-emerald-500" /> Tertagih (bayar masuk)</span>
            </div>
            <div className="flex h-48 items-end gap-1">
                {trend.map((t) => (
                    <div key={t.month} className="flex flex-1 flex-col items-center gap-1" title={`${t.month}: tagihan ${rpC(t.invoiced)} · tertagih ${rpC(t.collected)}`}>
                        <div className="flex h-40 w-full items-end justify-center gap-0.5">
                            <div className="w-1/2 rounded-t bg-muted-foreground/40" style={{ height: `${(t.invoiced / max) * 100}%` }} />
                            <div className="w-1/2 rounded-t bg-emerald-500" style={{ height: `${(t.collected / max) * 100}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{t.month}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PpnBars({ data }: { data: Props['ppnTrend'] }) {
    const max = Math.max(...data.map((d) => d.value), 1);
    return (
        <div className="flex h-32 items-end gap-1">
            {data.map((d) => (
                <div key={d.month} className="flex flex-1 flex-col items-center gap-1" title={`${d.month}: ${rpC(d.value)}`}>
                    <div className="flex h-24 w-full items-end justify-center">
                        <div className="w-2/3 rounded-t bg-sky-500" style={{ height: `${(d.value / max) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{d.month}</span>
                </div>
            ))}
        </div>
    );
}

export default function Finance({ hasData, years, year, kpi, ar, forecast, topDebtors, trend, termin, ppnTrend }: Props) {
    const [drill, setDrill] = useState<DrillFilter | null>(null);
    const maxDebtor = Math.max(...topDebtors.map((d) => d.outstanding), 1);
    const setYear = (y: string) => router.get(route('dashboard.finance'), { year: y }, { preserveState: true, preserveScroll: true, replace: true });

    return (
        <DashboardLayout breadcrumbs={breadcrumbs}>
            <Head title="Finance" />
            <div className="flex flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-2xl font-semibold">Finance</h1>
                        <p className="text-sm text-muted-foreground">Piutang, penagihan & pajak dari data ERP. Klik angka / batang / baris untuk lihat detail.</p>
                    </div>
                    <Select value={year} onValueChange={setYear}>
                        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {years.map((y) => (
                                <SelectItem key={y} value={y}>{y}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {!hasData ? (
                    <Card>
                        <CardContent className="flex h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                            <p>Belum ada data penjualan.</p>
                            <p className="text-sm">Buka menu Integrasi Data lalu klik "Sinkronkan dari ERP".</p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Kpi label="Piutang (Outstanding)" value={rpC(ar.outstanding)} sub="seluruh periode — klik detail" accent onClick={() => setDrill({ status: 'UNPAID' })} />
                            <Kpi label="Lewat Jatuh Tempo (Overdue)" value={rpC(kpi.overdue)} sub={`${kpi.overduePct}% dari total piutang`} danger />
                            <Kpi label="Collection Rate" value={`${ar.collectionRate}%`} sub="rasio tertagih — klik detail" onClick={() => setDrill({ view: 'collection' })} />
                            <Kpi label="DSO (rata-rata penagihan)" value={kpi.dso !== null ? `${kpi.dso} hari` : '–'} sub="invoice → tanggal bayar (yg lunas)" />
                            <Kpi label="Terbayar" value={rpC(ar.paid)} sub="total pembayaran masuk — klik" onClick={() => setDrill({ view: 'collection' })} />
                            <Kpi label="Jumlah Invoice" value={kpi.invoices.toLocaleString('id-ID')} sub="seluruh periode — klik detail" onClick={() => setDrill({ group: 'invoice-customer' })} />
                            <Kpi label="Rata-rata / Invoice" value={rpC(kpi.aov)} sub="nilai DPP per invoice" />
                            <Kpi label="PPN Keluaran" value={rpC(kpi.ppnYtd)} sub={`tahun ${year}`} />
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Aging Piutang</CardTitle>
                                    <p className="text-xs text-muted-foreground">Berapa lama piutang tertunggak (dari jatuh tempo). Klik untuk detail.</p>
                                </CardHeader>
                                <CardContent><BarList items={ar.aging} total={ar.outstanding} onItem={(_, idx) => setDrill({ aging: AGING_KEYS[idx] })} /></CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Proyeksi Jatuh Tempo (Cash-in)</CardTitle>
                                    <p className="text-xs text-muted-foreground">Kapan piutang akan jatuh tempo ke depan — untuk perencanaan kas.</p>
                                </CardHeader>
                                <CardContent><BarList items={forecast} color="bg-sky-500" total={ar.outstanding} /></CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Top Debtor — piutang terbesar</CardTitle>
                                <p className="text-xs text-muted-foreground">Customer dengan piutang terbesar & tunggakan terlama. Klik baris untuk lihat invoice-nya.</p>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-8 [&_th]:px-3">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-8 text-right">#</TableHead>
                                                <TableHead>Customer</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Total Piutang</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Lewat Tempo</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Tunggakan Tertua</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {topDebtors.length === 0 ? (
                                                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Tidak ada piutang.</TableCell></TableRow>
                                            ) : topDebtors.map((d, i) => (
                                                <TableRow key={d.customer} className="cursor-pointer hover:bg-accent/50" onClick={() => setDrill({ customer: d.customer, status: 'UNPAID' })}>
                                                    <TableCell className="text-right text-muted-foreground">{i + 1}</TableCell>
                                                    <TableCell>
                                                        <div className="truncate font-medium" title={d.customer}>{d.customer}</div>
                                                        <div className="mt-1 h-1.5 w-full max-w-xs rounded bg-muted">
                                                            <div className="h-1.5 rounded bg-amber-500" style={{ width: `${(d.outstanding / maxDebtor) * 100}%` }} />
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">{rpC(d.outstanding)}</TableCell>
                                                    <TableCell className={`text-right whitespace-nowrap tabular-nums ${d.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>{d.overdue > 0 ? rpC(d.overdue) : '–'}</TableCell>
                                                    <TableCell className="text-right whitespace-nowrap tabular-nums">{d.oldest > 0 ? `${d.oldest.toLocaleString('id-ID')} hari` : '–'}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid gap-4 lg:grid-cols-3">
                            <Card className="lg:col-span-2">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Tagihan vs Tertagih per Bulan · {year}</CardTitle>
                                    <p className="text-xs text-muted-foreground">Nilai invoice terbit vs pembayaran yang masuk (basis tanggal bayar).</p>
                                </CardHeader>
                                <CardContent><TrendBars trend={trend} /></CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Analisa Termin</CardTitle>
                                    <p className="text-xs text-muted-foreground">Komposisi piutang per termin pembayaran.</p>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                                        Bayar tepat waktu:{' '}
                                        <b className={termin.onTimeRate !== null && termin.onTimeRate >= 70 ? 'text-emerald-600' : 'text-amber-600'}>
                                            {termin.onTimeRate !== null ? `${termin.onTimeRate}%` : '–'}
                                        </b>
                                        <span className="text-xs text-muted-foreground"> dari {termin.paidWithDates} invoice lunas</span>
                                    </div>
                                    <BarList items={termin.composition} color="bg-violet-500" total={ar.outstanding} />
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">PPN Keluaran per Bulan · {year}</CardTitle>
                                <p className="text-xs text-muted-foreground">PPN yang dipungut dari faktur terbit — untuk perencanaan pajak.</p>
                            </CardHeader>
                            <CardContent><PpnBars data={ppnTrend} /></CardContent>
                        </Card>
                    </>
                )}
            </div>

            <DrilldownDialog filter={drill} onClose={() => setDrill(null)} />
        </DashboardLayout>
    );
}
