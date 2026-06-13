import { LeaveStatusBadge } from '@/components/leave-status-badge';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { Check, Eye, X } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Cuti', href: '#' },
    { title: 'Persetujuan Cuti', href: '/leave-approvals' },
];

interface Row {
    id: number;
    request_number: string;
    start_date: string;
    end_date: string;
    total_days: string | number;
    status: string;
    submitted_at: string | null;
    leave_type?: { name: string } | null;
    employee?: { full_name: string; employee_code: string } | null;
}

interface Props {
    pending: { data: Row[]; links: { url: string | null; label: string; active: boolean }[]; total: number };
}

const d = (v: string) => (v ? v.substring(0, 10) : '-');

export default function LeaveApprovals({ pending }: Props) {
    const [action, setAction] = useState<{ row: Row; type: 'approve' | 'reject' } | null>(null);
    const { data, setData, post, processing, reset } = useForm<{ note: string }>({ note: '' });

    const openAction = (row: Row, type: 'approve' | 'reject') => {
        reset();
        setAction({ row, type });
    };

    const submit = () => {
        if (!action) return;
        const url = action.type === 'approve'
            ? route('leave.approvals.approve', action.row.id)
            : route('leave.approvals.reject', action.row.id);
        post(url, { preserveScroll: true, onSuccess: () => setAction(null) });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Persetujuan Cuti" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">Persetujuan Cuti</h1>
                    <p className="text-sm text-muted-foreground">{pending.total} pengajuan menunggu keputusan Anda.</p>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Karyawan</TableHead>
                                    <TableHead>Jenis</TableHead>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead className="text-right">Hari</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pending.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Tidak ada pengajuan menunggu.</TableCell>
                                    </TableRow>
                                ) : (
                                    pending.data.map((r) => (
                                        <TableRow key={r.id}>
                                            <TableCell>
                                                <div className="font-medium">{r.employee?.full_name ?? '-'}</div>
                                                <div className="text-xs text-muted-foreground">{r.employee?.employee_code} · {r.request_number}</div>
                                            </TableCell>
                                            <TableCell>{r.leave_type?.name ?? '-'}</TableCell>
                                            <TableCell className="whitespace-nowrap">{d(r.start_date)} – {d(r.end_date)}</TableCell>
                                            <TableCell className="text-right">{r.total_days}</TableCell>
                                            <TableCell><LeaveStatusBadge status={r.status} /></TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" size="icon" asChild title="Detail">
                                                        <Link href={route('leave.show', r.id)}><Eye className="size-4" /></Link>
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="text-emerald-600" title="Setujui" onClick={() => openAction(r, 'approve')}>
                                                        <Check className="size-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="text-rose-600" title="Tolak" onClick={() => openAction(r, 'reject')}>
                                                        <X className="size-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Pagination links={pending.links} />
            </div>

            <Dialog open={action !== null} onOpenChange={(o) => !o && setAction(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{action?.type === 'approve' ? 'Setujui Pengajuan' : 'Tolak Pengajuan'}</DialogTitle>
                    </DialogHeader>
                    {action && (
                        <div className="grid gap-3">
                            <p className="text-sm text-muted-foreground">
                                {action.row.employee?.full_name} · {action.row.leave_type?.name} · {d(action.row.start_date)}–{d(action.row.end_date)} ({action.row.total_days} hari)
                            </p>
                            <div className="grid gap-2">
                                <Label htmlFor="note">Catatan {action.type === 'reject' ? '* (wajib)' : '(opsional)'}</Label>
                                <Textarea id="note" rows={3} value={data.note} onChange={(e) => setData('note', e.target.value)} />
                            </div>
                            <DialogFooter>
                                <Button
                                    onClick={submit}
                                    disabled={processing || (action.type === 'reject' && data.note.trim() === '')}
                                    className={action.type === 'approve' ? '' : 'bg-rose-600 hover:bg-rose-700'}
                                >
                                    {action.type === 'approve' ? 'Setujui' : 'Tolak'}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
