import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from '@inertiajs/react';
import { useEffect, useMemo, type FormEventHandler } from 'react';

export interface AdminLeaveTarget {
    employeeId: number;
    employeeName: string;
    date: string;
}

export interface AdminLeaveType {
    id: number;
    name: string;
    code: string;
    allow_half_day: boolean;
}

interface Props {
    target: AdminLeaveTarget | null;
    leaveTypes: AdminLeaveType[];
    onClose: () => void;
}

/**
 * HR direct-entry: record an already-approved leave for an employee on a clicked date.
 * Used from the attendance recap pages. Posts to leave.admin.record (auto-approve).
 */
export default function AdminLeaveDialog({ target, leaveTypes, onClose }: Props) {
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({
        employee_id: '',
        leave_type_id: '',
        start_date: '',
        end_date: '',
        day_part: 'full',
        reason: '',
    });

    useEffect(() => {
        if (target) {
            clearErrors();
            setData({
                employee_id: String(target.employeeId),
                leave_type_id: '',
                start_date: target.date,
                end_date: target.date,
                day_part: 'full',
                reason: '',
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target]);

    const selectedType = useMemo(() => leaveTypes.find((t) => String(t.id) === data.leave_type_id), [leaveTypes, data.leave_type_id]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('leave.admin.record'), {
            preserveScroll: true,
            onSuccess: () => {
                reset();
                onClose();
            },
        });
    };

    return (
        <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Catat Cuti / Absen</DialogTitle>
                    <DialogDescription>
                        {target?.employeeName} · mulai {target?.date}. Cuti langsung <b>disetujui</b> dan masuk ke daftar pengajuan.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="grid gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="al_type">Jenis *</Label>
                        <Select value={data.leave_type_id} onValueChange={(v) => setData('leave_type_id', v)}>
                            <SelectTrigger id="al_type">
                                <SelectValue placeholder="Pilih jenis (Annual / Sick / dll)" />
                            </SelectTrigger>
                            <SelectContent>
                                {leaveTypes.map((t) => (
                                    <SelectItem key={t.id} value={String(t.id)}>
                                        {t.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <InputError message={errors.leave_type_id} />
                    </div>

                    {selectedType?.allow_half_day && (
                        <div className="grid gap-2">
                            <Label htmlFor="al_daypart">Durasi</Label>
                            <Select value={data.day_part} onValueChange={(v) => setData((c) => ({ ...c, day_part: v, end_date: v === 'full' ? c.end_date : c.start_date }))}>
                                <SelectTrigger id="al_daypart">
                                    <SelectValue />
                                </SelectTrigger>
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
                            <Label htmlFor="al_start">Tanggal Mulai *</Label>
                            <Input
                                id="al_start"
                                type="date"
                                value={data.start_date}
                                onChange={(e) => setData((c) => ({ ...c, start_date: e.target.value, end_date: c.day_part === 'full' ? c.end_date : e.target.value }))}
                                required
                            />
                            <InputError message={errors.start_date} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="al_end">Tanggal Selesai</Label>
                            <Input id="al_end" type="date" value={data.end_date} min={data.start_date} disabled={data.day_part !== 'full'} onChange={(e) => setData('end_date', e.target.value)} />
                            <InputError message={errors.end_date} />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="al_reason">Keterangan</Label>
                        <Textarea id="al_reason" value={data.reason} onChange={(e) => setData('reason', e.target.value)} rows={2} placeholder="Opsional (mis. sakit, izin keluarga)" />
                        <InputError message={errors.reason} />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Batal
                        </Button>
                        <Button type="submit" disabled={processing}>
                            Simpan & Setujui
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
