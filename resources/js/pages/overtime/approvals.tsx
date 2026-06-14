import { LeaveStatusBadge, ROLE_LABEL } from '@/components/leave-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Check, X } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Lembur', href: '#' },
    { title: 'Persetujuan Lembur', href: '/overtime-approvals' },
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

interface Period {
    id: number;
    request_number: string;
    status: string;
    total_hours: string | number;
    total_amount: string | number;
    employee?: { full_name: string; employee_code: string } | null;
    entries: Entry[];
    approvals: { id: number; role: string; status: string; approver?: { full_name: string } | null }[];
    can_act: boolean;
}

const rupiah = (n: number | string) => 'Rp ' + Number(n).toLocaleString('id-ID');
const d = (v: string) => (v ? v.substring(0, 10) : '-');

export default function OvertimeApprovals({ periods }: { periods: Period[] }) {
    const decide = (entryId: number, status: 'approved' | 'rejected') => {
        router.post(route('overtime.approvals.entry', entryId), { status }, { preserveScroll: true });
    };

    const approve = (p: Period) => {
        if (confirm('Setujui lembur periode ini?')) {
            router.post(route('overtime.approvals.approve', p.id), {}, { preserveScroll: true });
        }
    };

    const reject = (p: Period) => {
        const note = window.prompt('Alasan penolakan:');
        if (note) {
            router.post(route('overtime.approvals.reject', p.id), { note }, { preserveScroll: true });
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Persetujuan Lembur" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">Persetujuan Lembur</h1>
                    <p className="text-sm text-muted-foreground">Periode lembur yang menunggu persetujuan Anda. Atasan menilai per baris; HR menyetujui periode.</p>
                </div>

                {periods.length === 0 ? (
                    <Card>
                        <CardContent className="py-10 text-center text-muted-foreground">Tidak ada pengajuan lembur yang menunggu Anda.</CardContent>
                    </Card>
                ) : (
                    periods.map((p) => {
                        const isSupervisorStep = p.status === 'pending_supervisor';
                        return (
                            <Card key={p.id}>
                                <CardContent className="grid gap-3 py-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <div className="font-medium">{p.employee?.full_name ?? '-'} <span className="text-muted-foreground">· {p.request_number}</span></div>
                                            <div className="text-xs text-muted-foreground">{Number(p.total_hours).toLocaleString('id-ID')} jam · {rupiah(p.total_amount)}</div>
                                        </div>
                                        <LeaveStatusBadge status={p.status} />
                                    </div>

                                    <Table className="text-sm [&_td]:px-2 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Tanggal</TableHead>
                                                <TableHead>Aktivitas</TableHead>
                                                <TableHead className="text-center">Jam</TableHead>
                                                <TableHead className="text-right">Durasi</TableHead>
                                                <TableHead>Status</TableHead>
                                                {p.can_act && isSupervisorStep && <TableHead className="text-right">Nilai Baris</TableHead>}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {p.entries.map((e) => (
                                                <TableRow key={e.id} className={e.status === 'rejected' ? 'opacity-50' : ''}>
                                                    <TableCell className="whitespace-nowrap">
                                                        {d(e.date)} {e.is_holiday && <span className="ml-1 rounded bg-rose-100 px-1 text-[10px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">libur</span>}
                                                    </TableCell>
                                                    <TableCell>{e.activity}{e.note && <span className="block text-[11px] text-muted-foreground">{e.note}</span>}</TableCell>
                                                    <TableCell className="text-center whitespace-nowrap">{e.start_time.substring(0, 5)}–{e.end_time.substring(0, 5)}</TableCell>
                                                    <TableCell className="text-right font-medium">{Number(e.hours).toLocaleString('id-ID')}</TableCell>
                                                    <TableCell><LeaveStatusBadge status={e.status} /></TableCell>
                                                    {p.can_act && isSupervisorStep && (
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <Button variant="ghost" size="icon" className="text-emerald-600" title="Setujui baris" onClick={() => decide(e.id, 'approved')}><Check className="size-4" /></Button>
                                                                <Button variant="ghost" size="icon" className="text-rose-600" title="Tolak baris" onClick={() => decide(e.id, 'rejected')}><X className="size-4" /></Button>
                                                            </div>
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>

                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                            {p.approvals.map((a) => (
                                                <span key={a.id} className="inline-flex items-center gap-1">
                                                    {ROLE_LABEL[a.role] ?? a.role}: <LeaveStatusBadge status={a.status} />
                                                </span>
                                            ))}
                                        </div>
                                        {p.can_act && (
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="outline" className="text-rose-600" onClick={() => reject(p)}>Tolak</Button>
                                                <Button size="sm" onClick={() => approve(p)}>{isSupervisorStep ? 'Setujui & Teruskan ke HR' : 'Setujui (Final)'}</Button>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>
        </AppLayout>
    );
}
