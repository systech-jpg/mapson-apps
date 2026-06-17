import { LeaveStatusBadge, ROLE_LABEL } from '@/components/leave-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { CheckCircle2, Clock, Download, FileText, XCircle } from 'lucide-react';

interface Approval {
    id: number;
    level: number;
    role: string;
    status: string;
    notes: string | null;
    acted_at: string | null;
    approver_employee_id: number | null;
    approver?: { id: number; full_name: string } | null;
}

interface Attachment {
    id: number;
    original_name: string;
}

interface Leave {
    id: number;
    request_number: string;
    start_date: string;
    end_date: string;
    day_part: string;
    total_days: string | number;
    reason: string | null;
    status: string;
    submitted_at: string | null;
    decision_note: string | null;
    leave_type?: { name: string; code: string } | null;
    employee?: { full_name: string; employee_code: string } | null;
    approvals?: Approval[];
    attachments?: Attachment[];
}

const d = (v: string | null) => (v ? v.substring(0, 10) : '-');

function Row({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right font-medium">{value || '-'}</span>
        </div>
    );
}

function StepIcon({ status }: { status: string }) {
    if (status === 'approved') return <CheckCircle2 className="size-5 text-emerald-600" />;
    if (status === 'rejected') return <XCircle className="size-5 text-rose-600" />;
    if (status === 'skipped') return <XCircle className="size-5 text-muted-foreground" />;
    return <Clock className="size-5 text-amber-500" />;
}

interface Can {
    approve: boolean;
    withdraw: boolean;
    cancel: boolean;
}

export default function LeaveShow({ leave, can }: { leave: Leave; can: Can }) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Cuti', href: '#' },
        { title: 'Cuti Saya', href: '/leave' },
        { title: leave.request_number, href: '#' },
    ];

    const approvals = leave.approvals ?? [];

    const approve = () => {
        if (confirm('Setujui pengajuan cuti ini?')) {
            router.post(route('leave.approvals.approve', leave.id), {}, { preserveScroll: true });
        }
    };
    const reject = () => {
        const note = window.prompt('Alasan penolakan:');
        if (note) {
            router.post(route('leave.approvals.reject', leave.id), { note }, { preserveScroll: true });
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={leave.request_number} />
            <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
                <div className="w-full space-y-4 lg:w-2/3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base">{leave.leave_type?.name ?? 'Cuti'}</CardTitle>
                            <LeaveStatusBadge status={leave.status} />
                        </CardHeader>
                        <CardContent>
                            <Row label="Nomor" value={leave.request_number} />
                            <Row label="Karyawan" value={leave.employee ? `${leave.employee.full_name} (${leave.employee.employee_code})` : null} />
                            <Row label="Tanggal" value={`${d(leave.start_date)} – ${d(leave.end_date)}`} />
                            <Row label="Durasi" value={`${leave.total_days} hari${leave.day_part !== 'full' ? ' (setengah hari)' : ''}`} />
                            <Row label="Alasan" value={leave.reason} />
                            <Row label="Diajukan" value={leave.submitted_at ? leave.submitted_at.substring(0, 16).replace('T', ' ') : null} />
                            {leave.decision_note && <Row label="Catatan Keputusan" value={leave.decision_note} />}
                        </CardContent>
                    </Card>

                    {(leave.attachments?.length ?? 0) > 0 && (
                        <Card>
                            <CardHeader><CardTitle className="text-base">Lampiran</CardTitle></CardHeader>
                            <CardContent className="flex flex-col gap-2">
                                {leave.attachments!.map((a) => (
                                    <a key={a.id} href={route('leave.attachments.download', [leave.id, a.id])}
                                        className="flex items-center gap-2 text-sm text-primary hover:underline">
                                        <FileText className="size-4" /> {a.original_name} <Download className="size-3.5" />
                                    </a>
                                ))}
                            </CardContent>
                        </Card>
                    )}

                    {(can.approve || can.withdraw || can.cancel) && (
                        <div className="flex flex-wrap gap-2">
                            {can.approve && (
                                <>
                                    <Button onClick={approve}>
                                        <CheckCircle2 className="size-4" /> Setujui
                                    </Button>
                                    <Button variant="outline" className="text-rose-600" onClick={reject}>
                                        <XCircle className="size-4" /> Tolak
                                    </Button>
                                </>
                            )}
                            {can.withdraw && (
                                <Button variant="outline" onClick={() => router.post(route('leave.withdraw', leave.id), {}, { preserveScroll: true })}>
                                    Tarik Pengajuan
                                </Button>
                            )}
                            {can.cancel && (
                                <Button variant="outline" className="text-rose-600" onClick={() => router.post(route('leave.cancel', leave.id), {}, { preserveScroll: true })}>
                                    Batalkan
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                <Card className="w-full lg:w-1/3">
                    <CardHeader><CardTitle className="text-base">Riwayat Persetujuan</CardTitle></CardHeader>
                    <CardContent>
                        <ol className="relative space-y-4 border-l pl-6">
                            {approvals.map((a) => (
                                <li key={a.id} className="relative">
                                    <span className="absolute -left-[31px] flex size-6 items-center justify-center rounded-full bg-background">
                                        <StepIcon status={a.status} />
                                    </span>
                                    <div className="text-sm font-medium">
                                        {a.level}. {ROLE_LABEL[a.role] ?? a.role}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {a.approver?.full_name ?? (a.approver_employee_id ? '' : 'sesuai peran')}
                                        {a.acted_at ? ` · ${a.acted_at.substring(0, 16).replace('T', ' ')}` : ''}
                                    </div>
                                    {a.notes && <div className="mt-0.5 text-xs text-muted-foreground italic">"{a.notes}"</div>}
                                </li>
                            ))}
                            {approvals.length === 0 && <li className="text-sm text-muted-foreground">Belum ada langkah.</li>}
                        </ol>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
