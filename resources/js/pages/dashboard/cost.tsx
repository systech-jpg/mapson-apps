import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import DashboardLayout from '@/layouts/dashboard-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { AlertTriangle, ArrowRight, Upload } from 'lucide-react';
import { useState } from 'react';
import { CostCompare, type Compare } from './partials/cost-compare';
import { CostMatrix, type Matrix } from './partials/cost-matrix';
import { CostPool, CostProduct, type PoolTotals, type ProductPnl } from './partials/cost-abc';
import { GlDrilldownDialog, type GlDrill } from './partials/gl-drilldown';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Cost', href: '/dashboard/cost' }];

interface Section { label: string; value: number; type: string; types: string | null; formula?: string }
interface Expense { code: string; nama: string | null; grup: string | null; kategori: string | null; baris: number; value: number }
interface Group { label: string; value: number }
interface Props {
    hasData: boolean;
    periods: string[];
    period: string | null;
    kpi: {
        pendapatan: number; hpp: number; labaKotor: number; beban: number; labaBersih: number;
        marginKotor: number | null; marginBersih: number | null;
        baris: number; seimbang: boolean; importedAt: string | null; branch: string | null;
    } | null;
    sections: Section[];
    topExpense: Expense[];
    groups: Group[];
    trend: { period: string; pendapatan: number; beban: number; hpp: number; laba: number; margin: number | null }[];
    view: 'ringkasan' | 'banding' | 'matriks' | 'pool' | 'produk';
    compare: Compare | null;
    matrix: Matrix | null;
    pool?: PoolTotals | null;
    produk?: ProductPnl | null;
}

const VIEWS: { key: Props['view']; label: string }[] = [
    { key: 'ringkasan', label: 'Ringkasan' },
    { key: 'banding', label: 'Bandingkan' },
    { key: 'matriks', label: 'Matriks' },
    { key: 'pool', label: 'Pool Biaya' },
    { key: 'produk', label: 'P&L Produk' },
];

const rpC = (n: number) => {
    const x = Number(n || 0);
    const s = x < 0 ? '-' : '';
    const a = Math.abs(x);
    if (a >= 1e9) return s + 'Rp ' + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (a >= 1e6) return s + 'Rp ' + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return s + 'Rp ' + a.toLocaleString('id-ID');
};
const rp = (n: number) => 'Rp ' + Math.round(Number(n || 0)).toLocaleString('id-ID');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtPeriod = (p: string) => {
    const [y, m] = p.split('-');
    return `${MONTHS[Number(m) - 1]} ${y}`;
};

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'warn' }) {
    const border = tone === 'bad' ? 'border-red-300 dark:border-red-900' : tone === 'warn' ? 'border-amber-300 dark:border-amber-800' : '';
    const color = tone === 'bad' ? 'text-red-600 dark:text-red-400' : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : '';
    return (
        <Card className={border}>
            <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
                {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
            </CardContent>
        </Card>
    );
}

function BarList({ items, total }: { items: Group[]; total: number }) {
    const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
    if (items.length === 0) return <p className="text-sm text-muted-foreground">Belum ada data.</p>;
    return (
        <div className="space-y-2">
            {items.map((it) => (
                <div key={it.label}>
                    <div className="flex justify-between gap-2 text-xs">
                        <span className="truncate" title={it.label}>{it.label}</span>
                        <span className="shrink-0 font-medium">
                            {rpC(it.value)}
                            {total > 0 && <span className="ml-1 font-normal text-muted-foreground">· {((Math.abs(it.value) / total) * 100).toFixed(1)}%</span>}
                        </span>
                    </div>
                    <div className="mt-0.5 h-2 w-full rounded bg-muted">
                        <div className="h-2 rounded bg-rose-500" style={{ width: `${(Math.abs(it.value) / max) * 100}%` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function Cost({ hasData, periods, period, kpi, sections, topExpense, groups, trend, view, compare, matrix, pool, produk }: Props) {
    const [drill, setDrill] = useState<GlDrill | null>(null);
    const go = (params: Record<string, string>) =>
        router.get(route('dashboard.cost'), params, { preserveState: true, preserveScroll: true, replace: true });
    const setPeriod = (p: string) => go({ view, period: p });
    const totalBeban = kpi ? Math.abs(kpi.beban) : 0;

    return (
        <DashboardLayout breadcrumbs={breadcrumbs}>
            <Head title="Cost" />
            <div className="flex flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-2xl font-semibold">Cost / Laba Rugi</h1>
                        <p className="text-sm text-muted-foreground">
                            Disusun dari Buku Besar Manual Import yang diunggah, memakai struktur akun (COA) — bukan angka yang diketik ulang.
                        </p>
                    </div>
                    {hasData && periods.length > 0 && (
                        <div className="flex items-center gap-2">
                            <div className="flex rounded-md border p-0.5">
                                {VIEWS.map((v) => (
                                    <Button
                                        key={v.key}
                                        size="sm"
                                        variant={view === v.key ? 'default' : 'ghost'}
                                        className="h-7 px-2.5"
                                        onClick={() => go({ view: v.key, period: period ?? '' })}
                                    >
                                        {v.label}
                                    </Button>
                                ))}
                            </div>
                            {(view === 'ringkasan' || view === 'pool' || view === 'produk') && (
                                <Select value={period ?? ''} onValueChange={setPeriod}>
                                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {periods.map((p) => <SelectItem key={p} value={p}>{fmtPeriod(p)}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    )}
                </div>

                {!hasData ? (
                    <Card>
                        <CardContent className="flex h-64 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                            <p>Belum ada Buku Besar yang diunggah.</p>
                            <p className="max-w-lg text-sm">
                                Endpoint jurnal Manual Import diblokir hak akses, jadi data biaya masuk lewat unggahan laporan
                                <b> Histori Buku Besar</b> (tanpa filter akun, satu bulan per file).
                            </p>
                            <Link href={route('dwh.pipeline')} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                                <Upload className="size-4" /> Buka Pipeline Data untuk mengunggah <ArrowRight className="size-4" />
                            </Link>
                        </CardContent>
                    </Card>
                ) : view === 'banding' && compare ? (
                    <CostCompare
                        compare={compare}
                        periods={periods}
                        onChange={(a, b) => go({ view: 'banding', a, b })}
                        onDrill={(p, account) => setDrill({ period: p, account })}
                    />
                ) : view === 'matriks' && matrix ? (
                    <CostMatrix matrix={matrix} onDrill={(p, account) => setDrill({ period: p, account })} />
                ) : view === 'pool' && pool ? (
                    <CostPool data={pool} />
                ) : view === 'produk' && produk ? (
                    <CostProduct data={produk} />
                ) : (
                    <>
                        {kpi && !kpi.seimbang && (
                            <p className="flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                                <AlertTriangle className="size-3.5" /> Debit dan kredit periode ini tidak seimbang — angka di bawah mungkin tidak lengkap. Coba unggah ulang laporannya.
                            </p>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Kpi label={`Pendapatan · ${fmtPeriod(period ?? '')}`} value={rpC(kpi?.pendapatan ?? 0)} sub="dari akun bertipe REVENUE" />
                            <Kpi label="Laba Kotor" value={rpC(kpi?.labaKotor ?? 0)} sub={kpi?.marginKotor !== null ? `margin ${kpi?.marginKotor}% · setelah HPP ${rpC(kpi?.hpp ?? 0)}` : undefined} />
                            <Kpi label="Beban Operasional" value={rpC(kpi?.beban ?? 0)} tone="warn" sub="beban usaha periode ini" />
                            <Kpi
                                label="Laba Bersih"
                                value={rpC(kpi?.labaBersih ?? 0)}
                                tone={(kpi?.labaBersih ?? 0) >= 0 ? 'good' : 'bad'}
                                sub={kpi?.marginBersih !== null ? `margin ${kpi?.marginBersih}%` : undefined}
                            />
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Struktur Laba Rugi · {fmtPeriod(period ?? '')}</CardTitle>
                                    <p className="text-xs text-muted-foreground">
                                        {kpi?.baris.toLocaleString('id-ID')} baris buku besar{kpi?.branch ? ` · ${kpi.branch}` : ''}
                                        {kpi?.importedAt ? ` · diunggah ${kpi.importedAt}` : ''} — <b>klik baris</b> untuk membedah akun penyusunnya.
                                    </p>
                                </CardHeader>
                                <CardContent>
                                    <Table className="text-sm [&_td]:px-3 [&_td]:py-2">
                                        <TableBody>
                                            {sections.map((s) => {
                                                const bisaKlik = !!s.types && !!period;
                                                return (
                                                    <TableRow
                                                        key={s.label}
                                                        className={`${s.type === 'total' ? 'border-t-2 font-bold' : s.type === 'sub' ? 'border-t font-semibold' : ''} ${bisaKlik ? 'cursor-pointer hover:bg-accent/50' : ''}`}
                                                        onClick={bisaKlik ? () => setDrill({ period: period!, types: s.types!, label: s.label }) : undefined}
                                                        title={bisaKlik ? 'Klik untuk lihat akun penyusunnya' : s.formula}
                                                    >
                                                        <TableCell className={s.type === 'out' ? 'pl-6 text-muted-foreground' : ''}>
                                                            {s.label}
                                                            {s.formula && <div className="text-[11px] font-normal text-muted-foreground">{s.formula}</div>}
                                                        </TableCell>
                                                        <TableCell className={`text-right tabular-nums whitespace-nowrap ${s.value < 0 ? 'text-red-600 dark:text-red-400' : s.type === 'total' ? 'text-emerald-600 dark:text-emerald-400' : ''}`} title={rp(s.value)}>
                                                            {rpC(s.value)}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Kelompok Biaya</CardTitle>
                                    <p className="text-xs text-muted-foreground">Pakai kategori manual bila sudah dipetakan; selain itu memakai grup akun dari COA.</p>
                                </CardHeader>
                                <CardContent><BarList items={groups} total={totalBeban} /></CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Beban Terbesar per Akun</CardTitle>
                                <p className="text-xs text-muted-foreground">
                                    Termasuk HPP &amp; beban non-operasional. <b>Klik baris</b> untuk melihat transaksi di baliknya (no. bukti &amp; keterangan) — angka di
                                    sini bisa ditelusuri sendiri sampai ke sumbernya.
                                </p>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-8 [&_th]:px-3">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-8 text-right">#</TableHead>
                                                <TableHead>Kode</TableHead>
                                                <TableHead>Akun</TableHead>
                                                <TableHead>Grup / Kategori</TableHead>
                                                <TableHead className="text-right">Transaksi</TableHead>
                                                <TableHead className="text-right">Nilai</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {topExpense.length === 0 ? (
                                                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Tidak ada beban.</TableCell></TableRow>
                                            ) : topExpense.map((t, i) => (
                                                <TableRow
                                                    key={t.code}
                                                    className="cursor-pointer hover:bg-accent/50"
                                                    onClick={() => period && setDrill({ period, account: t.code })}
                                                    title="Klik untuk lihat transaksinya"
                                                >
                                                    <TableCell className="text-right text-muted-foreground">{i + 1}</TableCell>
                                                    <TableCell className="font-mono text-xs whitespace-nowrap">{t.code}</TableCell>
                                                    <TableCell className="font-medium">{t.nama}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{t.kategori ?? t.grup ?? '–'}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{t.baris.toLocaleString('id-ID')}</TableCell>
                                                    <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap" title={rp(t.value)}>{rpC(t.value)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>

                        {trend.length > 1 && (
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-base">Tren antar Periode</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto">
                                        <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-8 [&_th]:px-3">
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Periode</TableHead>
                                                    <TableHead className="text-right">Pendapatan</TableHead>
                                                    <TableHead className="text-right">HPP</TableHead>
                                                    <TableHead className="text-right">Beban</TableHead>
                                                    <TableHead className="text-right">Laba Bersih</TableHead>
                                                    <TableHead className="text-right">Margin</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {trend.map((t) => (
                                                    <TableRow key={t.period} className={t.period === period ? 'bg-accent/40' : ''}>
                                                        <TableCell className="font-medium">{fmtPeriod(t.period)}</TableCell>
                                                        <TableCell className="text-right tabular-nums" title={rp(t.pendapatan)}>{rpC(t.pendapatan)}</TableCell>
                                                        <TableCell className="text-right tabular-nums" title={rp(-t.hpp)}>{rpC(-t.hpp)}</TableCell>
                                                        <TableCell className="text-right tabular-nums" title={rp(-t.beban)}>{rpC(-t.beban)}</TableCell>
                                                        <TableCell className={`text-right font-semibold tabular-nums ${t.laba < 0 ? 'text-red-600 dark:text-red-400' : ''}`} title={rp(t.laba)}>{rpC(t.laba)}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-muted-foreground">{t.margin === null ? '–' : `${t.margin}%`}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    <p className="mt-2 text-[11px] text-muted-foreground">
                                        Beban sudah termasuk beban non-operasional; Laba Bersih memakai rumus yang sama persis dengan KPI di atas.
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        <p className="text-[11px] text-muted-foreground">
                            Sumber: laporan Histori Buku Besar Manual Import yang diunggah, digabung dengan struktur akun (COA) yang ditarik otomatis. Mengunggah
                            ulang periode yang sama akan memperbarui angka di sini — perlu, karena buku yang sudah tutup masih bisa berubah.
                        </p>
                    </>
                )}
            </div>

            <GlDrilldownDialog drill={drill} onClose={() => setDrill(null)} />
        </DashboardLayout>
    );
}
