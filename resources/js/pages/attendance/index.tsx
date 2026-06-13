import { Can } from '@/components/can';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { LoaderCircle, RefreshCw, Search } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Data Absensi', href: '#' },
    { title: 'Tarikan Hadirr', href: '/attendance' },
];

interface Row {
    id: number;
    nik: string;
    name: string | null;
    date: string;
    clock_in: string | null;
    clock_out: string | null;
    overtime_in: string | null;
    overtime_out: string | null;
    clock_in_spot: string | null;
    clock_out_spot: string | null;
    status: string | null;
    shift_name: string | null;
    notes: string | null;
    employee_id: number | null;
    employee_name: string | null;
    employee_code: string | null;
    match_method: string | null;
}

interface PaginationLink {
    url: string | null;
    label: string;
    active: boolean;
}

interface Paginated {
    data: Row[];
    links: PaginationLink[];
    total: number;
    from: number | null;
    to: number | null;
}

const time = (v: string | null) => (v ? v.substring(11, 16) : '-');

const today = () => new Date().toISOString().substring(0, 10);
const monthStart = () => today().substring(0, 8) + '01';

export default function AttendanceIndex({
    rows,
    filters,
    stats,
    connected,
}: {
    rows: Paginated;
    filters: { from: string | null; to: string | null; search: string };
    stats: { total: number; unmatched_employees: number; last_sync: string | null };
    connected: boolean;
}) {
    const [from, setFrom] = useState(filters.from ?? '');
    const [to, setTo] = useState(filters.to ?? '');
    const [search, setSearch] = useState(filters.search ?? '');
    const [syncFrom, setSyncFrom] = useState(monthStart());
    const [syncTo, setSyncTo] = useState(today());
    const [syncing, setSyncing] = useState(false);

    const applyFilter = () => {
        router.get(route('attendance.index'), { from: from || undefined, to: to || undefined, search: search || undefined }, { preserveState: true, preserveScroll: true });
    };

    const doSync = () => {
        setSyncing(true);
        router.post(route('attendance.sync'), { from: syncFrom, to: syncTo }, {
            preserveScroll: true,
            onFinish: () => setSyncing(false),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Tarikan Hadirr" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">Tarikan Hadirr</h1>
                        <p className="text-sm text-muted-foreground">
                            Data absensi mentah dari Hadirr. {stats.total.toLocaleString('id-ID')} baris tersimpan
                            {stats.last_sync ? ` — sinkron terakhir ${stats.last_sync}` : ''}.
                        </p>
                    </div>
                    <Can on="attendance-raw" do="edit">
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="grid gap-1">
                                <Label htmlFor="sync_from" className="text-xs">Sinkron dari</Label>
                                <Input id="sync_from" type="date" className="h-8 w-38" value={syncFrom} onChange={(e) => setSyncFrom(e.target.value)} />
                            </div>
                            <div className="grid gap-1">
                                <Label htmlFor="sync_to" className="text-xs">sampai</Label>
                                <Input id="sync_to" type="date" className="h-8 w-38" value={syncTo} onChange={(e) => setSyncTo(e.target.value)} />
                            </div>
                            <Button size="sm" onClick={doSync} disabled={syncing || !connected}>
                                {syncing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                                Sinkronkan dari Hadirr
                            </Button>
                        </div>
                    </Can>
                </div>

                {!connected && (
                    <Card>
                        <CardContent className="py-3 text-sm text-amber-700 dark:text-amber-400">
                            Hadirr belum terhubung. Atur dulu di Integrasi Data → Hadirr → Setting.
                        </CardContent>
                    </Card>
                )}

                {stats.unmatched_employees > 0 && (
                    <Card>
                        <CardContent className="py-3 text-sm text-amber-700 dark:text-amber-400">
                            {stats.unmatched_employees} karyawan Hadirr belum terpetakan ke master Employee (NIK KTP tidak cocok).
                            Lengkapi/koreksi <b>NIK KTP</b> di menu Employees, lalu sinkron ulang.
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardContent className="flex flex-wrap items-end gap-3 pt-6">
                        <div className="grid gap-1.5">
                            <Label htmlFor="filter_from">Dari</Label>
                            <Input id="filter_from" type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="filter_to">Sampai</Label>
                            <Input id="filter_to" type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="search">Cari</Label>
                            <Input id="search" className="w-56" placeholder="Nama / NIK" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFilter()} />
                        </div>
                        <Button variant="outline" onClick={applyFilter}>
                            <Search className="size-4" /> Terapkan
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table className="text-sm [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-9 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Tanggal</TableHead>
                                        <TableHead>Karyawan</TableHead>
                                        <TableHead>Mapping</TableHead>
                                        <TableHead className="text-center">Masuk</TableHead>
                                        <TableHead className="text-center">Pulang</TableHead>
                                        <TableHead className="text-center">Lembur</TableHead>
                                        <TableHead>Lokasi</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.data.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                                                Belum ada data. Klik "Sinkronkan dari Hadirr" untuk menarik data absensi.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        rows.data.map((r) => (
                                            <TableRow key={r.id}>
                                                <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                                                <TableCell>
                                                    <div className="font-medium">{r.name}</div>
                                                    <div className="text-xs text-muted-foreground">{r.nik}</div>
                                                </TableCell>
                                                <TableCell>
                                                    {r.employee_id ? (
                                                        <Badge variant="secondary" className="gap-1" title={`Cocok via ${r.match_method === 'nik' ? 'NIK KTP' : r.match_method === 'email' ? 'email user' : 'manual'}`}>
                                                            {r.employee_code ?? r.employee_name}
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">belum terpetakan</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center whitespace-nowrap">{time(r.clock_in)}</TableCell>
                                                <TableCell className="text-center whitespace-nowrap">{time(r.clock_out)}</TableCell>
                                                <TableCell className="text-center whitespace-nowrap">
                                                    {r.overtime_in ? `${time(r.overtime_in)} - ${time(r.overtime_out)}` : '-'}
                                                </TableCell>
                                                <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground" title={r.clock_in_spot ?? ''}>
                                                    {r.clock_in_spot ?? '-'}
                                                </TableCell>
                                                <TableCell>
                                                    {r.status && <Badge variant={r.status.toLowerCase().includes('hadir') ? 'secondary' : 'outline'}>{r.status}</Badge>}
                                                    {r.shift_name && <div className="text-xs text-muted-foreground">{r.shift_name}</div>}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                        {rows.from != null ? `Menampilkan ${rows.from}–${rows.to} dari ${rows.total.toLocaleString('id-ID')}` : ''}
                    </span>
                    <Pagination links={rows.links} />
                </div>
            </div>
        </AppLayout>
    );
}
