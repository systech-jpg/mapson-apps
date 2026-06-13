import { Can } from '@/components/can';
import { ConfirmDelete } from '@/components/confirm-delete';
import { LeaveStatusBadge } from '@/components/leave-status-badge';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Eye, Search } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Kelola Cuti', href: '#' },
    { title: 'Semua Pengajuan', href: '/leave-admin/requests' },
];
const ALL = 'all';

interface Row {
    id: number;
    request_number: string;
    start_date: string;
    end_date: string;
    total_days: string | number;
    status: string;
    leave_type?: { name: string } | null;
    employee?: { full_name: string; employee_code: string } | null;
}

interface Props {
    requests: { data: Row[]; links: { url: string | null; label: string; active: boolean }[]; total: number };
    filters: { status: string; type_id: number | null; search: string; from: string | null; to: string | null };
    leaveTypes: { id: number; name: string }[];
    statuses: string[];
}

const d = (v: string) => (v ? v.substring(0, 10) : '-');
const STATUS_LABEL: Record<string, string> = {
    pending_supervisor: 'Menunggu Supervisor', pending_manager: 'Menunggu Manager', pending_hr: 'Menunggu HR',
    pending_director: 'Menunggu Direktur', approved: 'Disetujui', rejected: 'Ditolak', withdrawn: 'Ditarik',
    cancelled: 'Dibatalkan', expired: 'Kedaluwarsa',
};

export default function AdminRequests({ requests, filters, leaveTypes, statuses }: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const apply = (extra: Record<string, unknown> = {}) =>
        router.get(route('leave.admin.requests'), {
            search, status: filters.status || undefined, type_id: filters.type_id ?? undefined,
            from: filters.from ?? undefined, to: filters.to ?? undefined, ...extra,
        }, { preserveState: true, replace: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Semua Pengajuan Cuti" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <h1 className="text-xl font-semibold">Semua Pengajuan Cuti</h1>

                <div className="flex flex-wrap items-end gap-2">
                    <div className="flex items-center gap-2">
                        <Input className="w-56" placeholder="Cari karyawan / NIP" value={search}
                            onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} />
                        <Button variant="outline" size="icon" onClick={() => apply()}><Search className="size-4" /></Button>
                    </div>
                    <Select value={filters.status || ALL} onValueChange={(v) => apply({ status: v === ALL ? undefined : v })}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Semua status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>Semua status</SelectItem>
                            {statuses.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s] ?? s}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={filters.type_id ? String(filters.type_id) : ALL} onValueChange={(v) => apply({ type_id: v === ALL ? undefined : v })}>
                        <SelectTrigger className="w-44"><SelectValue placeholder="Semua jenis" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>Semua jenis</SelectItem>
                            {leaveTypes.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
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
                                {requests.data.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Tidak ada data.</TableCell></TableRow>
                                ) : requests.data.map((r) => (
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
                                                <Button variant="ghost" size="icon" asChild><Link href={route('leave.show', r.id)}><Eye className="size-4" /></Link></Button>
                                                {(r.status.startsWith('pending') || r.status === 'approved') && (
                                                    <Can on="leave-admin-requests" do="edit">
                                                        <ConfirmDelete url={route('leave.admin.cancel', r.id)} method="post" actionLabel="Batalkan"
                                                            title={`Batalkan ${r.request_number}?`} description="Saldo (jika ada) akan dikembalikan."
                                                            trigger={<Button variant="ghost" size="sm" className="text-rose-600">Batalkan</Button>} />
                                                    </Can>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Pagination links={requests.links} />
            </div>
        </AppLayout>
    );
}
