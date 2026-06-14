import { LeaveStatusBadge, ROLE_LABEL } from '@/components/leave-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Kelola Lembur', href: '#' },
    { title: 'Pengajuan Lembur', href: '/overtime-admin' },
    { title: 'Detail', href: '#' },
];

interface Entry {
    id: number;
    date: string;
    activity: string;
    start_time: string;
    end_time: string;
    hours: string | number;
    is_holiday: boolean;
    status: string;
    note: string | null;
}

interface Overtime {
    id: number;
    request_number: string;
    period: string;
    status: string;
    total_hours: string | number;
    total_amount: string | number;
    rate_per_hour: string | number | null;
    multiplier_workday: string | number | null;
    multiplier_holiday: string | number | null;
    period_start: string;
    period_end: string;
    employee?: { full_name: string; employee_code: string } | null;
    entries: Entry[];
    approvals: { id: number; role: string; status: string; notes: string | null; approver?: { full_name: string } | null }[];
    can_act: boolean;
}

const rupiah = (n: number | string | null) => 'Rp ' + Number(n ?? 0).toLocaleString('id-ID');
const d = (v: string) => (v ? v.substring(0, 10) : '-');

export default function OvertimeShow({ overtime }: { overtime: Overtime }) {
    const approve = () => {
        if (confirm('Setujui lembur periode ini?')) {
            router.post(route('overtime.approvals.approve', overtime.id), {}, { preserveScroll: true });
        }
    };
    const reject = () => {
        const note = window.prompt('Alasan penolakan:');
        if (note) {
            router.post(route('overtime.approvals.reject', overtime.id), { note }, { preserveScroll: true });
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Lembur ${overtime.request_number}`} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">{overtime.employee?.full_name ?? '-'}</h1>
                        <p className="text-sm text-muted-foreground">{overtime.request_number} · periode {overtime.period} ({d(overtime.period_start)} – {d(overtime.period_end)})</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <LeaveStatusBadge status={overtime.status} />
                        {overtime.can_act && (
                            <>
                                <Button size="sm" variant="outline" className="text-rose-600" onClick={reject}>Tolak</Button>
                                <Button size="sm" onClick={approve}>Setujui</Button>
                            </>
                        )}
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Total Jam</div><div className="text-2xl font-semibold">{Number(overtime.total_hours).toLocaleString('id-ID')}</div></CardContent></Card>
                    <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Nominal</div><div className="text-2xl font-semibold">{rupiah(overtime.total_amount)}</div></CardContent></Card>
                    <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Tarif {overtime.rate_per_hour ? '(terkunci)' : '(berjalan)'}</div><div className="text-sm">{rupiah(overtime.rate_per_hour)}/jam · ×{overtime.multiplier_workday ?? '-'} / ×{overtime.multiplier_holiday ?? '-'}</div></CardContent></Card>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead>Aktivitas</TableHead>
                                    <TableHead className="text-center">Jam</TableHead>
                                    <TableHead className="text-right">Durasi</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {overtime.entries.map((e) => (
                                    <TableRow key={e.id} className={e.status === 'rejected' ? 'opacity-50' : ''}>
                                        <TableCell className="whitespace-nowrap">{d(e.date)} {e.is_holiday && <span className="ml-1 rounded bg-rose-100 px-1 text-[10px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">libur</span>}</TableCell>
                                        <TableCell>{e.activity}{e.note && <span className="block text-[11px] text-muted-foreground">{e.note}</span>}</TableCell>
                                        <TableCell className="text-center whitespace-nowrap">{e.start_time.substring(0, 5)}–{e.end_time.substring(0, 5)}</TableCell>
                                        <TableCell className="text-right font-medium">{Number(e.hours).toLocaleString('id-ID')}</TableCell>
                                        <TableCell><LeaveStatusBadge status={e.status} /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="py-4">
                        <div className="mb-2 text-sm font-medium">Persetujuan</div>
                        <div className="grid gap-2">
                            {overtime.approvals.map((a) => (
                                <div key={a.id} className="flex items-center justify-between text-sm">
                                    <span>{ROLE_LABEL[a.role] ?? a.role}{a.approver ? ` · ${a.approver.full_name}` : ''}{a.notes ? ` — ${a.notes}` : ''}</span>
                                    <LeaveStatusBadge status={a.status} />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
