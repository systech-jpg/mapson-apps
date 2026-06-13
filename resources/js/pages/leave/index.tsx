import { Can } from '@/components/can';
import { LeaveStatusBadge } from '@/components/leave-status-badge';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import InputError from '@/components/input-error';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { Eye, Plus } from 'lucide-react';
import { type FormEventHandler, useMemo, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Cuti', href: '#' },
    { title: 'Cuti Saya', href: '/leave' },
];

interface LeaveTypeOpt {
    id: number;
    code: string;
    name: string;
    unit: string;
    requires_attachment: boolean;
    allow_half_day: boolean;
    gender_constraint: string;
}

interface RequestRow {
    id: number;
    request_number: string;
    start_date: string;
    end_date: string;
    day_part: string;
    total_days: string | number;
    status: string;
    leave_type?: { name: string; code: string } | null;
}

interface Props {
    employeeLinked: boolean;
    requests: { data: RequestRow[]; links: { url: string | null; label: string; active: boolean }[]; total: number } | null;
    balances: { code: string; name: string; available: number }[];
    year: number;
    leaveTypes: LeaveTypeOpt[];
}

const d = (v: string) => (v ? v.substring(0, 10) : '-');

export default function LeaveMine({ employeeLinked, requests, balances, year, leaveTypes }: Props) {
    const [open, setOpen] = useState(false);

    const { data, setData, post, processing, errors, reset, clearErrors } = useForm<{
        leave_type_id: string;
        start_date: string;
        end_date: string;
        day_part: string;
        reason: string;
        attachments: File[];
    }>({ leave_type_id: '', start_date: '', end_date: '', day_part: 'full', reason: '', attachments: [] });

    const selectedType = useMemo(() => leaveTypes.find((t) => String(t.id) === data.leave_type_id), [leaveTypes, data.leave_type_id]);

    const openForm = () => {
        reset();
        clearErrors();
        setOpen(true);
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('leave.store'), { forceFormData: true, onSuccess: () => setOpen(false) });
    };

    const setHalf = (v: string) => {
        setData((cur) => ({ ...cur, day_part: v, end_date: v === 'full' ? cur.end_date : cur.start_date }));
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Cuti Saya" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">Cuti Saya</h1>
                        <p className="text-sm text-muted-foreground">Saldo & pengajuan cuti tahun {year}.</p>
                    </div>
                    {employeeLinked && (
                        <Can on="leave-mine" do="create">
                            <Button onClick={openForm}>
                                <Plus className="size-4" /> Ajukan Cuti
                            </Button>
                        </Can>
                    )}
                </div>

                {!employeeLinked && (
                    <Card>
                        <CardContent className="py-3 text-sm text-amber-700 dark:text-amber-400">
                            Akun Anda belum tertaut ke data karyawan. Hubungi HR untuk menautkan.
                        </CardContent>
                    </Card>
                )}

                {balances.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {balances.map((b) => (
                            <Card key={b.code}>
                                <CardContent className="py-4">
                                    <div className="text-xs text-muted-foreground">{b.name}</div>
                                    <div className="text-2xl font-semibold">{b.available}</div>
                                    <div className="text-xs text-muted-foreground">hari tersedia</div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {requests && (
                    <Card>
                        <CardContent className="p-0">
                            <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nomor</TableHead>
                                        <TableHead>Jenis</TableHead>
                                        <TableHead>Tanggal</TableHead>
                                        <TableHead className="text-right">Hari</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {requests.data.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Belum ada pengajuan.</TableCell>
                                        </TableRow>
                                    ) : (
                                        requests.data.map((r) => (
                                            <TableRow key={r.id}>
                                                <TableCell className="font-medium whitespace-nowrap">{r.request_number}</TableCell>
                                                <TableCell>{r.leave_type?.name ?? '-'}</TableCell>
                                                <TableCell className="whitespace-nowrap">{d(r.start_date)} – {d(r.end_date)}</TableCell>
                                                <TableCell className="text-right">{r.total_days}</TableCell>
                                                <TableCell><LeaveStatusBadge status={r.status} /></TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button variant="ghost" size="icon" asChild>
                                                            <Link href={route('leave.show', r.id)}><Eye className="size-4" /></Link>
                                                        </Button>
                                                        {r.status.startsWith('pending') && (
                                                            <Button variant="ghost" size="sm" className="text-amber-600"
                                                                onClick={() => router.post(route('leave.withdraw', r.id), {}, { preserveScroll: true })}>
                                                                Tarik
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {requests && <Pagination links={requests.links} />}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[92vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Ajukan Cuti</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="leave_type_id">Jenis Cuti *</Label>
                            <Select value={data.leave_type_id} onValueChange={(v) => setData('leave_type_id', v)}>
                                <SelectTrigger id="leave_type_id"><SelectValue placeholder="Pilih jenis" /></SelectTrigger>
                                <SelectContent>
                                    {leaveTypes.map((t) => (
                                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <InputError message={errors.leave_type_id} />
                        </div>

                        {selectedType?.allow_half_day && (
                            <div className="grid gap-2">
                                <Label htmlFor="day_part">Durasi</Label>
                                <Select value={data.day_part} onValueChange={setHalf}>
                                    <SelectTrigger id="day_part"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="full">Sehari penuh</SelectItem>
                                        <SelectItem value="first_half">Setengah hari (pagi)</SelectItem>
                                        <SelectItem value="second_half">Setengah hari (sore)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="start_date">Tanggal Mulai *</Label>
                                <Input id="start_date" type="date" value={data.start_date}
                                    onChange={(e) => setData((c) => ({ ...c, start_date: e.target.value, end_date: c.day_part === 'full' ? c.end_date : e.target.value }))} required />
                                <InputError message={errors.start_date} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="end_date">Tanggal Selesai *</Label>
                                <Input id="end_date" type="date" value={data.end_date} disabled={data.day_part !== 'full'}
                                    onChange={(e) => setData('end_date', e.target.value)} required />
                                <InputError message={errors.end_date} />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="reason">Alasan</Label>
                            <Textarea id="reason" value={data.reason} onChange={(e) => setData('reason', e.target.value)} rows={2} />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="attachments">Lampiran {selectedType?.requires_attachment ? '*' : '(opsional)'}</Label>
                            <Input id="attachments" type="file" multiple accept=".pdf,.jpg,.jpeg,.png"
                                onChange={(e) => setData('attachments', Array.from(e.target.files ?? []))} />
                            {selectedType?.requires_attachment && <p className="text-xs text-muted-foreground">Jenis cuti ini wajib melampirkan dokumen.</p>}
                            <InputError message={errors.attachments} />
                        </div>

                        <DialogFooter>
                            <Button type="submit" disabled={processing}>Kirim Pengajuan</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
