import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Data Absensi', href: '#' },
    { title: 'Rekap Kehadiran', href: '/attendance/recap' },
];

interface DateCol {
    date: string;
    day: number;
    dow: string;
    weekend: boolean;
    holiday: boolean;
    holiday_name: string | null;
}

interface Cell {
    mark: string | null;
    kind: 'present' | 'wfh' | 'leave' | 'holiday' | 'weekend' | 'alpha' | 'empty';
}

interface TypeCol {
    code: string;
    abbr: string;
    label: string;
    color: string | null;
}

interface EmployeeRow {
    nik: string;
    name: string | null;
    code: string | null;
    position: string | null;
    matched: boolean;
    cells: Record<string, Cell>;
    hadir: number;
    ln: number;
    total_kehadiran: number;
    by_type: Record<string, number>;
    alpha: number;
    pemakaian_cuti: number | null;
    sisa_cuti: number | null;
}

interface Props {
    period: string;
    periodLabel: string;
    year: number;
    dates: DateCol[];
    typeCols: TypeCol[];
    employees: EmployeeRow[];
    stats: { unmatched_employees: number; last_sync: string | null };
}

const num = (n: number | null | undefined) => (n === null || n === undefined ? '-' : n.toLocaleString('id-ID'));
const cnt = (n: number) => (n > 0 ? n.toLocaleString('id-ID') : '');

const CELL_CLASS: Record<Cell['kind'], string> = {
    present: 'font-semibold text-emerald-600',
    wfh: 'font-semibold text-green-700 dark:text-green-500',
    leave: 'font-medium text-blue-600 dark:text-blue-400',
    holiday: 'text-rose-500',
    weekend: 'text-muted-foreground/40',
    alpha: 'font-bold text-rose-600',
    empty: 'text-muted-foreground/40',
};

export default function AttendanceRecap({ period, periodLabel, year, dates, typeCols, employees, stats }: Props) {
    const shiftPeriod = (delta: number) => {
        const [y, m] = period.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        const np = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        router.get(route('attendance.recap'), { period: np }, { preserveScroll: true, preserveState: true });
    };

    const summaryCount = 3 + typeCols.length + 3; // Hadir, LN, Total + types + Alpha, Pemakaian, Sisa

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Rekap Kehadiran" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">Rekap Kehadiran</h1>
                        <p className="text-sm text-muted-foreground">
                            Periode {periodLabel}{stats.last_sync ? ` · sinkron terakhir ${stats.last_sync}` : ''}. Untuk dasar perhitungan tunjangan/gaji.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center rounded-md border">
                            <Button variant="ghost" size="icon" className="size-8 rounded-r-none" onClick={() => shiftPeriod(-1)} title="Periode sebelumnya">
                                <ChevronLeft className="size-4" />
                            </Button>
                            <span className="px-2 text-sm font-medium">{periodLabel}</span>
                            <Button variant="ghost" size="icon" className="size-8 rounded-l-none" onClick={() => shiftPeriod(1)} title="Periode berikutnya">
                                <ChevronRight className="size-4" />
                            </Button>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                            <a href={route('attendance.recap.export', { period })}>
                                <FileSpreadsheet className="size-4" /> Export Excel
                            </a>
                        </Button>
                    </div>
                </div>

                {stats.unmatched_employees > 0 && (
                    <Card>
                        <CardContent className="py-3 text-sm text-amber-700 dark:text-amber-400">
                            {stats.unmatched_employees} karyawan Hadirr belum terpetakan ke master Employee (NIK KTP tidak cocok). Saldo & pemakaian cuti hanya muncul untuk yang terpetakan.
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-xs">
                                <thead>
                                    <tr className="border-b bg-muted/40">
                                        <th className="sticky left-0 z-30 min-w-[210px] border-r bg-muted px-2 py-1.5 text-left shadow-[2px_0_3px_-1px_rgba(0,0,0,0.08)]">Nama</th>
                                        {dates.map((d) => (
                                            <th
                                                key={d.date}
                                                className={`w-8 border-r px-1 py-1 text-center font-medium ${d.holiday ? 'bg-rose-200 dark:bg-rose-900/50' : d.weekend ? 'bg-rose-100 dark:bg-rose-950/40' : ''}`}
                                                title={d.holiday_name ? `${d.date} · ${d.holiday_name}` : d.date}
                                            >
                                                <div className="text-[10px] text-muted-foreground">{d.dow}</div>
                                                <div>{d.day}</div>
                                            </th>
                                        ))}
                                        <th className="border-r bg-emerald-50 px-1.5 py-1 text-center dark:bg-emerald-950/30" title="Jumlah hari hadir (clock-in)">Hadir</th>
                                        <th className="border-r bg-emerald-50 px-1.5 py-1 text-center dark:bg-emerald-950/30" title="Libur Nasional">LN</th>
                                        <th className="border-r bg-emerald-50 px-1.5 py-1 text-center font-semibold dark:bg-emerald-950/30" title="Hadir + WFH">Total</th>
                                        {typeCols.map((t) => (
                                            <th key={t.code} className="border-r bg-emerald-50 px-1.5 py-1 text-center dark:bg-emerald-950/30" title={t.label}>
                                                {t.abbr}
                                            </th>
                                        ))}
                                        <th className="border-r bg-emerald-50 px-1.5 py-1 text-center dark:bg-emerald-950/30" title="Alpha (tanpa keterangan)">A</th>
                                        <th className="border-r bg-emerald-50 px-1.5 py-1 text-center dark:bg-emerald-950/30" title={`Akumulasi cuti tahunan terpakai s/d ${year}`}>Pemakaian</th>
                                        <th className="bg-emerald-50 px-1.5 py-1 text-center font-semibold dark:bg-emerald-950/30" title="Saldo cuti tahunan tersisa">Sisa Cuti</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.length === 0 ? (
                                        <tr>
                                            <td colSpan={dates.length + summaryCount + 1} className="py-10 text-center text-muted-foreground">
                                                Belum ada data untuk periode ini. Tarik data di menu "Tarikan Hadirr".
                                            </td>
                                        </tr>
                                    ) : (
                                        employees.map((e, i) => (
                                            <tr key={e.nik} className="border-b hover:bg-muted/20">
                                                <td className="sticky left-0 z-20 border-r bg-background px-2 py-1 shadow-[2px_0_3px_-1px_rgba(0,0,0,0.08)]">
                                                    <div className="font-medium whitespace-nowrap">
                                                        <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>{e.name ?? e.nik}
                                                    </div>
                                                    <div className="truncate pl-4 text-[10px] text-muted-foreground">{e.position ?? (e.matched ? '—' : 'belum terpetakan')}</div>
                                                </td>
                                                {dates.map((d) => {
                                                    const c = e.cells[d.date];
                                                    return (
                                                        <td
                                                            key={d.date}
                                                            className={`border-r px-1 py-1 text-center whitespace-nowrap ${d.holiday ? 'bg-rose-100 dark:bg-rose-950/30' : d.weekend ? 'bg-rose-50 dark:bg-rose-950/20' : ''}`}
                                                        >
                                                            <span className={c ? CELL_CLASS[c.kind] : ''}>{c?.mark ?? <span className="text-muted-foreground/30">·</span>}</span>
                                                        </td>
                                                    );
                                                })}
                                                <td className="border-r bg-emerald-50/40 px-1.5 py-1 text-center dark:bg-emerald-950/10">{cnt(e.hadir)}</td>
                                                <td className="border-r bg-emerald-50/40 px-1.5 py-1 text-center dark:bg-emerald-950/10">{cnt(e.ln)}</td>
                                                <td className="border-r bg-emerald-50/40 px-1.5 py-1 text-center font-semibold dark:bg-emerald-950/10">{cnt(e.total_kehadiran)}</td>
                                                {typeCols.map((t) => (
                                                    <td key={t.code} className="border-r bg-emerald-50/40 px-1.5 py-1 text-center dark:bg-emerald-950/10">
                                                        {cnt(e.by_type[t.code] ?? 0)}
                                                    </td>
                                                ))}
                                                <td className={`border-r bg-emerald-50/40 px-1.5 py-1 text-center dark:bg-emerald-950/10 ${e.alpha > 0 ? 'font-semibold text-rose-600' : ''}`}>{cnt(e.alpha)}</td>
                                                <td className="border-r bg-emerald-50/40 px-1.5 py-1 text-center dark:bg-emerald-950/10">{num(e.pemakaian_cuti)}</td>
                                                <td className="bg-emerald-50/40 px-1.5 py-1 text-center font-semibold dark:bg-emerald-950/10">{num(e.sisa_cuti)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span><b className="text-emerald-600">✓</b> Hadir</span>
                    <span><b className="text-rose-500">LN</b> Libur Nasional</span>
                    <span><b className="text-rose-600">A</b> Alpha (tanpa keterangan)</span>
                    {typeCols.map((t) => (
                        <span key={t.code}><b className="text-foreground">{t.abbr}</b> {t.label}</span>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">
                    <b>Total</b> = Hadir + WFH. <b>Pemakaian</b> = akumulasi cuti tahunan terpakai s/d {year}; <b>Sisa Cuti</b> = saldo cuti tahunan tersisa (dari modul Cuti).
                    Kode absen diambil dari pengajuan cuti yang <b>disetujui</b>; kolom berarsir = akhir pekan / libur.
                </p>
            </div>
        </AppLayout>
    );
}
