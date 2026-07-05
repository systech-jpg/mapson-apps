import InputError from '@/components/input-error';
import { LeaveStatusBadge, ROLE_LABEL } from '@/components/leave-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { hm, hmLong, minutesBetween } from '@/lib/time';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Pencil, Plus, Printer, Trash2, Undo2 } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

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
    minutes: number;
    amount: string | number;
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
    total_minutes: number;
    total_amount: string | number;
    rate_per_hour: string | number | null;
    multiplier_workday: string | number | null;
    holiday_flat_rate: string | number | null;
    period_start: string;
    period_end: string;
    employee?: { full_name: string; employee_code: string } | null;
    entries: Entry[];
    approvals: { id: number; role: string; status: string; notes: string | null; approver?: { full_name: string } | null }[];
    can_act: boolean;
    can_return: boolean;
    can_edit_entries: boolean;
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
    const returnToDraft = () => {
        const note = window.prompt('Kembalikan ke draf untuk direvisi karyawan. Catatan revisi (opsional):', '');
        if (note === null) return;
        router.post(route('overtime.approvals.return', overtime.id), { note }, { preserveScroll: true });
    };

    // --- Admin entry CRUD (susulan), allowed until HR approval ---
    const [open, setOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        date: overtime.period_start,
        activity: '',
        start_time: '17:00',
        end_time: '19:00',
        note: '',
    });

    const openAdd = () => {
        reset();
        clearErrors();
        setData({ date: overtime.period_start, activity: '', start_time: '17:00', end_time: '19:00', note: '' });
        setEditingId(null);
        setOpen(true);
    };
    const openEdit = (e: Entry) => {
        clearErrors();
        setData({ date: e.date.substring(0, 10), activity: e.activity, start_time: e.start_time.substring(0, 5), end_time: e.end_time.substring(0, 5), note: e.note ?? '' });
        setEditingId(e.id);
        setOpen(true);
    };
    const submitEntry: FormEventHandler = (ev) => {
        ev.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editingId) {
            put(route('overtime.admin.entries.update', editingId), opts);
        } else {
            post(route('overtime.admin.entries.store', overtime.id), opts);
        }
    };
    const delEntry = (id: number) => {
        if (confirm('Hapus entri lembur ini?')) {
            router.delete(route('overtime.admin.entries.destroy', id), { preserveScroll: true });
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
                    <div className="flex flex-wrap items-center gap-2">
                        <LeaveStatusBadge status={overtime.status} />
                        {overtime.can_edit_entries && (
                            <Button size="sm" onClick={openAdd}><Plus className="size-4" /> Tambah Entri</Button>
                        )}
                        <Button size="sm" variant="outline" asChild>
                            <a href={route('overtime.pdf', overtime.id)} target="_blank" rel="noopener"><Printer className="size-4" /> Cetak PDF</a>
                        </Button>
                        {overtime.can_return && (
                            <Button size="sm" variant="outline" className="text-amber-600" onClick={returnToDraft}>
                                <Undo2 className="size-4" /> Revisi (Kembalikan ke Draf)
                            </Button>
                        )}
                        {overtime.can_act && (
                            <>
                                <Button size="sm" variant="outline" className="text-rose-600" onClick={reject}>Tolak</Button>
                                <Button size="sm" onClick={approve}>Setujui</Button>
                            </>
                        )}
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Total Jam (jam:menit)</div><div className="text-2xl font-semibold">{hm(overtime.total_minutes)}</div></CardContent></Card>
                    <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Nominal</div><div className="text-2xl font-semibold">{rupiah(overtime.total_amount)}</div></CardContent></Card>
                    <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Tarif {overtime.rate_per_hour ? '(terkunci)' : '(berjalan)'}</div><div className="text-sm">Kerja {rupiah(overtime.rate_per_hour)}/jam ×{overtime.multiplier_workday ?? '-'} · Libur {rupiah(overtime.holiday_flat_rate)}/hari</div></CardContent></Card>
                </div>

                {/* Mobile: stacked cards */}
                <div className="space-y-2 md:hidden">
                    {overtime.entries.length === 0 ? (
                        <Card>
                            <CardContent className="py-10 text-center text-sm text-muted-foreground">Belum ada entri lembur.</CardContent>
                        </Card>
                    ) : (
                        overtime.entries.map((e) => (
                            <Card key={e.id} className={e.status === 'rejected' ? 'opacity-50' : ''}>
                                <CardContent className="space-y-2 py-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="text-sm font-medium whitespace-nowrap">{d(e.date)} {e.is_holiday && <span className="ml-1 rounded bg-rose-100 px-1 text-[10px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">libur</span>}</div>
                                        <LeaveStatusBadge status={e.status} />
                                    </div>
                                    <div className="text-sm">{e.activity}{e.note && <span className="block text-[11px] text-muted-foreground">{e.note}</span>}</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                        <div>Jam: <span className="text-foreground">{e.start_time.substring(0, 5)}–{e.end_time.substring(0, 5)}</span></div>
                                        <div>Durasi: <span className="font-mono font-medium text-foreground">{hm(e.minutes)}</span></div>
                                        <div className="col-span-2">Nominal: <span className="text-foreground">{e.status === 'rejected' ? '—' : rupiah(e.amount)}</span></div>
                                    </div>
                                    {overtime.can_edit_entries && (
                                        <div className="flex gap-2 pt-1">
                                            <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(e)}><Pencil className="size-4" /> Ubah</Button>
                                            <Button variant="outline" size="sm" className="flex-1 text-rose-600" onClick={() => delEntry(e.id)}><Trash2 className="size-4" /> Hapus</Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>

                {/* Desktop: table */}
                <Card className="hidden md:block">
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                        <Table className="min-w-full text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead>Aktivitas</TableHead>
                                    <TableHead className="text-center">Jam</TableHead>
                                    <TableHead className="text-right">Durasi</TableHead>
                                    <TableHead className="text-right">Nominal</TableHead>
                                    <TableHead>Status</TableHead>
                                    {overtime.can_edit_entries && <TableHead className="text-right">Aksi</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {overtime.entries.map((e) => (
                                    <TableRow key={e.id} className={e.status === 'rejected' ? 'opacity-50' : ''}>
                                        <TableCell className="whitespace-nowrap">{d(e.date)} {e.is_holiday && <span className="ml-1 rounded bg-rose-100 px-1 text-[10px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">libur</span>}</TableCell>
                                        <TableCell>{e.activity}{e.note && <span className="block text-[11px] text-muted-foreground">{e.note}</span>}</TableCell>
                                        <TableCell className="text-center whitespace-nowrap">{e.start_time.substring(0, 5)}–{e.end_time.substring(0, 5)}</TableCell>
                                        <TableCell className="text-right font-mono font-medium">{hm(e.minutes)}</TableCell>
                                        <TableCell className="text-right whitespace-nowrap">{e.status === 'rejected' ? '—' : rupiah(e.amount)}</TableCell>
                                        <TableCell><LeaveStatusBadge status={e.status} /></TableCell>
                                        {overtime.can_edit_entries && (
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="size-4" /></Button>
                                                    <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => delEntry(e.id)}><Trash2 className="size-4" /></Button>
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                                {overtime.entries.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={overtime.can_edit_entries ? 7 : 6} className="py-10 text-center text-muted-foreground">Belum ada entri lembur.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                        </div>
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

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="w-[95vw] max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editingId ? 'Ubah Entri Lembur' : 'Tambah Entri Lembur (Susulan)'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submitEntry} className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="a_date">Tanggal *</Label>
                            <Input id="a_date" type="date" min={overtime.period_start} max={overtime.period_end} value={data.date} onChange={(e) => setData('date', e.target.value)} required />
                            <InputError message={errors.date} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="a_activity">Aktivitas *</Label>
                            <Input id="a_activity" value={data.activity} onChange={(e) => setData('activity', e.target.value)} placeholder="mis. Closing laporan bulanan" required />
                            <InputError message={errors.activity} />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="a_start">Jam Mulai *</Label>
                                <Input id="a_start" type="time" value={data.start_time} onChange={(e) => setData('start_time', e.target.value)} required />
                                <InputError message={errors.start_time} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="a_end">Jam Selesai *</Label>
                                <Input id="a_end" type="time" value={data.end_time} onChange={(e) => setData('end_time', e.target.value)} required />
                                <InputError message={errors.end_time} />
                            </div>
                        </div>
                        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                            Durasi: <b className="font-mono">{hm(minutesBetween(data.start_time, data.end_time))}</b>
                            <span className="text-muted-foreground"> ({hmLong(minutesBetween(data.start_time, data.end_time))})</span>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="a_note">Catatan</Label>
                            <Input id="a_note" value={data.note} onChange={(e) => setData('note', e.target.value)} />
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
