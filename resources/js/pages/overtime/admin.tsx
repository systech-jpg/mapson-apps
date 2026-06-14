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
import { Eye } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Kelola Lembur', href: '#' },
    { title: 'Pengajuan Lembur', href: '/overtime-admin' },
];

interface Row {
    id: number;
    request_number: string;
    period: string;
    status: string;
    total_hours: string | number;
    total_amount: string | number;
    submitted_at: string | null;
    employee?: { full_name: string; employee_code: string } | null;
}

interface Props {
    periods: { data: Row[]; links: { url: string | null; label: string; active: boolean }[]; total: number };
    filters: { status: string; period: string; search: string };
    statuses: string[];
}

const ALL = 'all';
const rupiah = (n: number | string) => 'Rp ' + Number(n).toLocaleString('id-ID');

export default function OvertimeAdmin({ periods, filters, statuses }: Props) {
    const [search, setSearch] = useState(filters.search);

    const apply = (patch: Record<string, string>) => {
        const next = { ...filters, search, ...patch };
        router.get(route('overtime.admin.index'), Object.fromEntries(Object.entries(next).filter(([, v]) => v !== '' && v !== ALL)), {
            preserveState: true,
            replace: true,
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Pengajuan Lembur" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">Pengajuan Lembur</h1>
                    <p className="text-sm text-muted-foreground">Monitoring & otorisasi lembur seluruh karyawan ({periods.total}).</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            apply({});
                        }}
                        className="flex gap-2"
                    >
                        <Input className="w-56" placeholder="Cari karyawan / kode…" value={search} onChange={(e) => setSearch(e.target.value)} />
                        <Button type="submit" variant="outline">Cari</Button>
                    </form>
                    <Input className="w-40" type="month" value={filters.period} onChange={(e) => apply({ period: e.target.value })} />
                    <Select value={filters.status || ALL} onValueChange={(v) => apply({ status: v === ALL ? '' : v })}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Semua status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>Semua status</SelectItem>
                            {statuses.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Karyawan</TableHead>
                                    <TableHead>Nomor</TableHead>
                                    <TableHead>Periode</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Total Jam</TableHead>
                                    <TableHead className="text-right">Nominal</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {periods.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Belum ada pengajuan lembur.</TableCell>
                                    </TableRow>
                                ) : (
                                    periods.data.map((r) => (
                                        <TableRow key={r.id}>
                                            <TableCell className="whitespace-nowrap">
                                                <div className="font-medium">{r.employee?.full_name ?? '-'}</div>
                                                <div className="text-xs text-muted-foreground">{r.employee?.employee_code}</div>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">{r.request_number}</TableCell>
                                            <TableCell>{r.period}</TableCell>
                                            <TableCell><LeaveStatusBadge status={r.status} /></TableCell>
                                            <TableCell className="text-right">{Number(r.total_hours).toLocaleString('id-ID')}</TableCell>
                                            <TableCell className="text-right">{rupiah(r.total_amount)}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" asChild>
                                                    <Link href={route('overtime.admin.show', r.id)}><Eye className="size-4" /></Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Pagination links={periods.links} />
            </div>
        </AppLayout>
    );
}
