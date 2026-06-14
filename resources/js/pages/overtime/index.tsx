import InputError from '@/components/input-error';
import { LeaveStatusBadge, ROLE_LABEL } from '@/components/leave-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Lembur', href: '#' },
    { title: 'Lembur Saya', href: '/overtime' },
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

interface Approval {
    id: number;
    level: number;
    role: string;
    status: string;
    notes: string | null;
    approver?: { full_name: string } | null;
}

interface OvertimePeriod {
    id: number;
    request_number: string;
    status: string;
    total_hours: string | number;
    total_amount: string | number;
    entries: Entry[];
    approvals: Approval[];
}

interface Props {
    employeeLinked: boolean;
    period: string;
    periodLabel: string;
    periodStart: string;
    periodEnd: string;
    overtime: OvertimePeriod | null;
    periods: { id: number; period: string; status: string; total_hours: string | number; total_amount: string | number }[];
    settings: { rate_per_hour: number; multiplier_workday: number; multiplier_holiday: number };
}

const rupiah = (n: number | string) => 'Rp ' + Number(n).toLocaleString('id-ID');
const d = (v: string) => (v ? v.substring(0, 10) : '-');

export default function OvertimeMine({ employeeLinked, period, periodLabel, periodStart, periodEnd, overtime, periods, settings }: Props) {
    const [open, setOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    const editable = !overtime || overtime.status === 'draft' || overtime.status === 'rejected';

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        period,
        date: periodStart,
        activity: '',
        start_time: '17:00',
        end_time: '19:00',
        note: '',
    });

    const openAdd = () => {
        reset();
        clearErrors();
        setData({ period, date: periodStart, activity: '', start_time: '17:00', end_time: '19:00', note: '' });
        setEditingId(null);
        setOpen(true);
    };

    const openEdit = (e: Entry) => {
        clearErrors();
        setData({ period, date: e.date.substring(0, 10), activity: e.activity, start_time: e.start_time.substring(0, 5), end_time: e.end_time.substring(0, 5), note: e.note ?? '' });
        setEditingId(e.id);
        setOpen(true);
    };

    const submit: FormEventHandler = (ev) => {
        ev.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editingId) {
            put(route('overtime.entries.update', editingId), opts);
        } else {
            post(route('overtime.entries.store'), opts);
        }
    };

    const shiftPeriod = (delta: number) => {
        const [y, m] = period.split('-').map(Number);
        const dt = new Date(y, m - 1 + delta, 1);
        const np = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        router.get(route('overtime.index'), { period: np }, { preserveScroll: true, preserveState: true });
    };

    const del = (id: number) => {
        if (confirm('Hapus entri lembur ini?')) {
            router.delete(route('overtime.entries.destroy', id), { preserveScroll: true });
        }
    };

    const submitPeriod = () => {
        if (overtime && confirm('Ajukan lembur periode ini untuk persetujuan?')) {
            router.post(route('overtime.submit', overtime.id), {}, { preserveScroll: true });
        }
    };

    const entries = overtime?.entries ?? [];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Lembur Saya" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">Lembur Saya</h1>
                        <p className="text-sm text-muted-foreground">Periode {periodLabel}.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-md border">
                            <Button variant="ghost" size="icon" className="size-8 rounded-r-none" onClick={() => shiftPeriod(-1)}>
                                <ChevronLeft className="size-4" />
                            </Button>
                            <span className="px-2 text-sm font-medium">{period}</span>
                            <Button variant="ghost" size="icon" className="size-8 rounded-l-none" onClick={() => shiftPeriod(1)}>
                                <ChevronRight className="size-4" />
                            </Button>
                        </div>
                        {employeeLinked && editable && (
                            <Button onClick={openAdd}>
                                <Plus className="size-4" /> Tambah Entri
                            </Button>
                        )}
                    </div>
                </div>

                {!employeeLinked && (
                    <Card>
                        <CardContent className="py-3 text-sm text-amber-700 dark:text-amber-400">
                            Akun Anda belum tertaut ke data karyawan. Hubungi HR untuk menautkan.
                        </CardContent>
                    </Card>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-xs text-muted-foreground">Status</div>
                            <div className="mt-1">{overtime ? <LeaveStatusBadge status={overtime.status} /> : <span className="text-sm text-muted-foreground">Belum ada</span>}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-xs text-muted-foreground">Total Jam (disetujui/diajukan)</div>
                            <div className="text-2xl font-semibold">{Number(overtime?.total_hours ?? 0).toLocaleString('id-ID')} jam</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-xs text-muted-foreground">Estimasi Nominal</div>
                            <div className="text-2xl font-semibold">{rupiah(overtime?.total_amount ?? 0)}</div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead>Aktivitas</TableHead>
                                    <TableHead className="text-center">Mulai</TableHead>
                                    <TableHead className="text-center">Selesai</TableHead>
                                    <TableHead className="text-right">Jam</TableHead>
                                    <TableHead>Status</TableHead>
                                    {editable && <TableHead className="text-right">Aksi</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {entries.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={editable ? 7 : 6} className="py-10 text-center text-muted-foreground">
                                            Belum ada entri lembur untuk periode ini.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    entries.map((e) => (
                                        <TableRow key={e.id} className={e.status === 'rejected' ? 'opacity-50' : ''}>
                                            <TableCell className="whitespace-nowrap">
                                                {d(e.date)} {e.is_holiday && <span className="ml-1 rounded bg-rose-100 px-1 text-[10px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">libur</span>}
                                            </TableCell>
                                            <TableCell>{e.activity}</TableCell>
                                            <TableCell className="text-center">{e.start_time.substring(0, 5)}</TableCell>
                                            <TableCell className="text-center">{e.end_time.substring(0, 5)}</TableCell>
                                            <TableCell className="text-right font-medium">{Number(e.hours).toLocaleString('id-ID')}</TableCell>
                                            <TableCell><LeaveStatusBadge status={e.status} /></TableCell>
                                            {editable && (
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="size-4" /></Button>
                                                        <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => del(e.id)}><Trash2 className="size-4" /></Button>
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {editable && entries.length > 0 && (
                    <div>
                        <Button onClick={submitPeriod}>
                            <Send className="size-4" /> Ajukan Periode Ini
                        </Button>
                    </div>
                )}

                {overtime && overtime.approvals.length > 0 && (
                    <Card>
                        <CardContent className="py-4">
                            <div className="mb-2 text-sm font-medium">Persetujuan Periode</div>
                            <div className="grid gap-2">
                                {overtime.approvals.map((a) => (
                                    <div key={a.id} className="flex items-center justify-between text-sm">
                                        <span>{ROLE_LABEL[a.role] ?? a.role}{a.approver ? ` · ${a.approver.full_name}` : ''}</span>
                                        <LeaveStatusBadge status={a.status} />
                                    </div>
                                ))}
                            </div>
                            {overtime.status === 'rejected' && overtime.approvals.find((a) => a.notes) && (
                                <p className="mt-2 text-xs text-rose-600">Catatan: {overtime.approvals.find((a) => a.notes)?.notes}</p>
                            )}
                        </CardContent>
                    </Card>
                )}

                <p className="text-xs text-muted-foreground">
                    Tarif berlaku: <b>{rupiah(settings.rate_per_hour)}</b>/jam · pengali hari kerja ×{settings.multiplier_workday}, hari libur ×{settings.multiplier_holiday}.
                    Nominal final dikunci saat disetujui HR.
                </p>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingId ? 'Ubah Entri Lembur' : 'Tambah Entri Lembur'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="ot_date">Tanggal *</Label>
                            <Input id="ot_date" type="date" min={periodStart} max={periodEnd} value={data.date} onChange={(e) => setData('date', e.target.value)} required />
                            <InputError message={errors.date} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ot_activity">Aktivitas *</Label>
                            <Input id="ot_activity" value={data.activity} onChange={(e) => setData('activity', e.target.value)} placeholder="mis. Closing laporan bulanan" required />
                            <InputError message={errors.activity} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="ot_start">Jam Mulai *</Label>
                                <Input id="ot_start" type="time" value={data.start_time} onChange={(e) => setData('start_time', e.target.value)} required />
                                <InputError message={errors.start_time} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="ot_end">Jam Selesai *</Label>
                                <Input id="ot_end" type="time" value={data.end_time} onChange={(e) => setData('end_time', e.target.value)} required />
                                <InputError message={errors.end_time} />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ot_note">Catatan</Label>
                            <Input id="ot_note" value={data.note} onChange={(e) => setData('note', e.target.value)} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                            <Button type="submit" disabled={processing}>Simpan</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
