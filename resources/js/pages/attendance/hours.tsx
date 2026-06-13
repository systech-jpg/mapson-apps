import AdminLeaveDialog, { type AdminLeaveTarget, type AdminLeaveType } from '@/components/leave/admin-leave-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Data Absensi', href: '#' },
    { title: 'Rekap per Jam', href: '/attendance/hours' },
];

interface DateCol {
    date: string;
    day: number;
    dow: string;
    weekend: boolean;
}

interface Cell {
    t: string | null;
    o: string | null;
    late: boolean;
}

interface EmployeeRow {
    nik: string;
    employee_id: number | null;
    name: string | null;
    code: string | null;
    position: string | null;
    matched: boolean;
    cells: Record<string, Cell | null>;
    late_count: number;
    late_label: string;
    al_deduction: number;
    overtime_label: string;
    keterangan: string;
}

interface Props {
    period: string;
    periodLabel: string;
    dates: DateCol[];
    employees: EmployeeRow[];
    rules: { deadline: string; full: string };
    leaveTypes: AdminLeaveType[];
    stats: { unmatched_employees: number; last_sync: string | null };
}

const fmtAl = (n: number) => (n > 0 ? n.toLocaleString('id-ID') : '-');

export default function AttendanceHours({ period, periodLabel, dates, employees, rules, leaveTypes, stats }: Props) {
    const { can } = usePermissions();
    const canRecord = can('leave-admin-requests', 'create');
    const [target, setTarget] = useState<AdminLeaveTarget | null>(null);

    const shiftPeriod = (delta: number) => {
        const [y, m] = period.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        const np = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        router.get(route('attendance.hours'), { period: np }, { preserveScroll: true, preserveState: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Rekap Absensi per Jam" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">Rekap Absensi per Jam</h1>
                        <p className="text-sm text-muted-foreground">
                            Periode {periodLabel}{stats.last_sync ? ` · sinkron terakhir ${stats.last_sync}` : ''}.
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
                            <a href={route('attendance.hours.export', { period })}>
                                <FileSpreadsheet className="size-4" /> Export Excel
                            </a>
                        </Button>
                    </div>
                </div>

                {stats.unmatched_employees > 0 && (
                    <Card>
                        <CardContent className="py-3 text-sm text-amber-700 dark:text-amber-400">
                            {stats.unmatched_employees} karyawan Hadirr belum terpetakan ke master Employee (NIK KTP tidak cocok).
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
                                            <th key={d.date} className={`w-12 border-r px-1 py-1 text-center font-medium ${d.weekend ? 'bg-rose-100 dark:bg-rose-950/40' : ''}`} title={d.date}>
                                                <div className="text-[10px] text-muted-foreground">{d.dow}</div>
                                                <div>{d.day}</div>
                                            </th>
                                        ))}
                                        <th className="border-r px-2 py-1 text-center" title="Jumlah hari terlambat (masuk > 09:00)">Telat</th>
                                        <th className="border-r px-2 py-1 text-center">Total Jam Telat</th>
                                        <th className="border-r px-2 py-1 text-center" title="Potong annual leave: >09:00 = ½ hari, >12:00 = 1 hari">Potong Cuti</th>
                                        <th className="border-r px-2 py-1 text-center">Overtime</th>
                                        <th className="px-2 py-1 text-left">Keterangan</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.length === 0 ? (
                                        <tr>
                                            <td colSpan={dates.length + 6} className="py-10 text-center text-muted-foreground">
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
                                                    const clickable = canRecord && e.employee_id !== null && !d.weekend;
                                                    return (
                                                        <td
                                                            key={d.date}
                                                            onClick={clickable ? () => setTarget({ employeeId: e.employee_id as number, employeeName: e.name ?? e.nik, date: d.date }) : undefined}
                                                            title={clickable ? 'Klik untuk catat cuti/absen' : undefined}
                                                            className={`border-r px-1 py-1 text-center leading-tight whitespace-nowrap ${d.weekend ? 'bg-rose-50 dark:bg-rose-950/20' : ''} ${clickable ? 'cursor-pointer hover:bg-primary/10' : ''}`}
                                                        >
                                                            {c?.t || c?.o ? (
                                                                <>
                                                                    <div className={c.late ? 'font-semibold text-rose-600' : ''}>{c.t ?? '–'}</div>
                                                                    <div className="text-[10px] text-muted-foreground">{c.o ?? '–'}</div>
                                                                </>
                                                            ) : (
                                                                <span className="text-muted-foreground/40">·</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className="border-r px-2 py-1 text-center">{e.late_count || '-'}</td>
                                                <td className="border-r px-2 py-1 text-center whitespace-nowrap">{e.late_count ? e.late_label : '-'}</td>
                                                <td className={`border-r px-2 py-1 text-center font-medium ${e.al_deduction > 0 ? 'text-rose-600' : ''}`}>{fmtAl(e.al_deduction)}</td>
                                                <td className="border-r px-2 py-1 text-center whitespace-nowrap">{e.overtime_label}</td>
                                                <td className="px-2 py-1 text-muted-foreground">{e.keterangan}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                <p className="text-xs text-muted-foreground">
                    Aturan: masuk lebih dari <b>{rules.deadline}</b> dihitung terlambat → potong cuti <b>½ hari</b>; lebih dari <b>{rules.full}</b> → potong cuti <b>1 hari</b>.
                    Tiap sel: baris atas = <b>jam masuk</b> (merah jika telat), baris bawah = <b>jam keluar</b>. Kolom berarsir = akhir pekan.
                    {canRecord && <> <b className="text-foreground">Klik sel tanggal</b> untuk mencatat cuti/absen karyawan (langsung disetujui).</>}
                </p>
            </div>

            <AdminLeaveDialog target={target} leaveTypes={leaveTypes} onClose={() => setTarget(null)} />
        </AppLayout>
    );
}
