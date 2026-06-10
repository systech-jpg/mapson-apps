import { DrilldownDialog, type DrillFilter } from '@/components/drilldown-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DashboardLayout from '@/layouts/dashboard-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Dashboard', href: '/dashboard' }];

interface Bar {
    label: string;
    value: number;
}

interface Props {
    years: string[];
    year: string;
    prevYear: string;
    hasData: boolean;
    kpi: {
        dpp: number; ttc: number; ppn: number; invoices: number; customers: number;
        discount: number; aov: number; yoy: number | null; mom: number | null;
        momCompare: { last: { ym: string; value: number }; prev: { ym: string; value: number } } | null;
    };
    ar: { paid: number; outstanding: number; collectionRate: number; aging: Bar[] };
    trend: { month: string; current: number; previous: number }[];
    topCustomers: Bar[];
    topRegions: Bar[];
    topMerk: Bar[];
}

const AGING_KEYS = ['belum', '1-30', '31-60', '61-90', '90plus'];
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtYm = (ym: string) => {
    const [y, m] = ym.split('-');
    return `${MONTHS_ID[Number(m) - 1]} ${y}`;
};

const rp = (n: number) => 'Rp ' + Math.round(Number(n || 0)).toLocaleString('id-ID');
const rpC = (n: number) => {
    const x = Number(n || 0);
    if (Math.abs(x) >= 1e9) return 'Rp ' + (x / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (Math.abs(x) >= 1e6) return 'Rp ' + (x / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return 'Rp ' + x.toLocaleString('id-ID');
};
const pct = (n: number | null) => (n === null ? '–' : `${n >= 0 ? '+' : ''}${n}%`);
const pctColor = (n: number | null) => (n === null ? 'text-muted-foreground' : n >= 0 ? 'text-emerald-600' : 'text-red-600');

function Kpi({ label, value, sub, accent, onClick }: { label: string; value: string; sub?: React.ReactNode; accent?: boolean; onClick?: () => void }) {
    return (
        <Card
            className={`${accent ? 'border-amber-300 dark:border-amber-800' : ''} ${onClick ? 'cursor-pointer transition-colors hover:bg-accent/40' : ''}`}
            onClick={onClick}
        >
            <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`mt-1 text-2xl font-bold ${accent ? 'text-amber-600 dark:text-amber-400' : ''}`}>{value}</p>
                {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
            </CardContent>
        </Card>
    );
}

function BarList({ items, color = 'bg-primary', onItem }: { items: Bar[]; color?: string; onItem?: (item: Bar, index: number) => void }) {
    const max = Math.max(...items.map((i) => i.value), 1);
    if (items.length === 0) return <p className="text-sm text-muted-foreground">Tidak ada data.</p>;
    return (
        <div className="space-y-2">
            {items.map((it, idx) => (
                <div
                    key={it.label + idx}
                    className={onItem ? 'cursor-pointer rounded p-1 -mx-1 hover:bg-accent/50' : ''}
                    onClick={onItem ? () => onItem(it, idx) : undefined}
                >
                    <div className="flex justify-between gap-2 text-xs">
                        <span className="truncate" title={it.label}>{it.label}</span>
                        <span className="shrink-0 font-medium">{rpC(it.value)}</span>
                    </div>
                    <div className="mt-0.5 h-2 w-full rounded bg-muted">
                        <div className={`h-2 rounded ${color}`} style={{ width: `${(it.value / max) * 100}%` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function MonthlyTrend({ trend, year, prevYear, onMonth }: { trend: Props['trend']; year: string; prevYear: string; onMonth: (m: number) => void }) {
    const max = Math.max(...trend.flatMap((t) => [t.current, t.previous]), 1);
    return (
        <div>
            <div className="mb-2 flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-primary" /> {year}</span>
                <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-muted-foreground/40" /> {prevYear}</span>
            </div>
            <div className="flex h-48 items-end gap-1">
                {trend.map((t, i) => (
                    <div
                        key={t.month}
                        className="flex flex-1 cursor-pointer flex-col items-center gap-1 rounded hover:bg-accent/40"
                        onClick={() => onMonth(i + 1)}
                        title={`${t.month} ${year}: ${rp(t.current)} — klik untuk detail`}
                    >
                        <div className="flex h-40 w-full items-end justify-center gap-0.5">
                            <div className="w-1/2 rounded-t bg-primary" style={{ height: `${(t.current / max) * 100}%` }} />
                            <div className="w-1/2 rounded-t bg-muted-foreground/40" style={{ height: `${(t.previous / max) * 100}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{t.month}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function Dashboard({ years, year, prevYear, hasData, kpi, ar, trend, topCustomers, topRegions, topMerk }: Props) {
    const [drill, setDrill] = useState<DrillFilter | null>(null);
    const setYear = (y: string) => router.get(route('dashboard'), { year: y }, { preserveState: true, preserveScroll: true, replace: true });

    return (
        <DashboardLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />
            <div className="flex flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-2xl font-semibold">Dashboard Eksekutif</h1>
                        <p className="text-sm text-muted-foreground">Ringkasan penjualan & piutang dari data ERP. Klik angka / batang untuk lihat detail.</p>
                    </div>
                    <Select value={year} onValueChange={setYear}>
                        <SelectTrigger className="w-28">
                            <SelectValue />
                        </SelectTrigger>
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
                            <Kpi
                                label={`Penjualan (DPP) ${year}`}
                                value={rpC(kpi.dpp)}
                                onClick={() => setDrill({ year })}
                                sub={
                                    <>
                                        TTC {rpC(kpi.ttc)} · PPN {rpC(kpi.ppn)}
                                        {kpi.yoy !== null && <span className={pctColor(kpi.yoy)}> · {pct(kpi.yoy)} vs {prevYear}</span>}
                                    </>
                                }
                            />
                            <Kpi
                                label="Pertumbuhan (bulan penuh)"
                                value={pct(kpi.mom)}
                                sub={
                                    kpi.momCompare
                                        ? `${fmtYm(kpi.momCompare.last.ym)} (${rpC(kpi.momCompare.last.value)}) vs ${fmtYm(kpi.momCompare.prev.ym)} (${rpC(kpi.momCompare.prev.value)})`
                                        : 'data belum cukup'
                                }
                                onClick={kpi.momCompare ? () => setDrill({ months: `${kpi.momCompare!.last.ym},${kpi.momCompare!.prev.ym}` }) : undefined}
                            />
                            <Kpi label={`Jumlah Invoice ${year}`} value={kpi.invoices.toLocaleString('id-ID')} sub={`${kpi.customers} customer aktif`} onClick={() => setDrill({ year, group: 'invoice-customer' })} />
                            <Kpi label="Rata-rata / Invoice" value={rpC(kpi.aov)} sub="nilai DPP per invoice" onClick={() => setDrill({ year })} />
                            <Kpi label="Total Diskon" value={rpC(kpi.discount)} sub={`tahun ${year} — klik detail`} onClick={() => setDrill({ year, discounted: 1, view: 'discount' })} />
                            <Kpi label="Collection Rate" value={`${ar.collectionRate}%`} sub={`Terbayar ${rpC(ar.paid)} — klik detail`} onClick={() => setDrill({ view: 'collection' })} />
                            <Kpi label="Piutang (Outstanding)" value={rpC(ar.outstanding)} sub="seluruh periode — klik detail" accent onClick={() => setDrill({ status: 'UNPAID' })} />
                            <Kpi label="Customer Aktif" value={kpi.customers.toLocaleString('id-ID')} sub={`tahun ${year}`} onClick={() => setDrill({ year, view: 'customers' })} />
                        </div>

                        <div className="grid gap-4 lg:grid-cols-3">
                            <Card className="lg:col-span-2">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Tren Penjualan (DPP) per Bulan</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <MonthlyTrend
                                        trend={trend}
                                        year={year}
                                        prevYear={prevYear}
                                        onMonth={(m) => {
                                            const mm = String(m).padStart(2, '0');
                                            setDrill({ months: `${year}-${mm},${prevYear}-${mm}` });
                                        }}
                                    />
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Aging Piutang</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <BarList items={ar.aging} color="bg-amber-500" onItem={(_, idx) => setDrill({ aging: AGING_KEYS[idx] })} />
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-3">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Top Customer ({year})</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <BarList items={topCustomers} onItem={(it) => setDrill({ year, customer: it.label })} />
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Penjualan per Region ({year})</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <BarList items={topRegions} color="bg-sky-500" onItem={(it) => setDrill({ year, region: it.label })} />
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Penjualan per Merk ({year})</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <BarList items={topMerk} color="bg-violet-500" onItem={(it) => setDrill({ year, merk: it.label })} />
                                </CardContent>
                            </Card>
                        </div>
                    </>
                )}
            </div>

            <DrilldownDialog filter={drill} onClose={() => setDrill(null)} />
        </DashboardLayout>
    );
}
