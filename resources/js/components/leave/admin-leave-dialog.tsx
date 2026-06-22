import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { router, useForm } from '@inertiajs/react';
import { useEffect, useMemo, type FormEventHandler } from 'react';

export interface AdminLeaveTarget {
    employeeId: number;
    employeeName: string;
    date: string;
    // When present → edit an existing leave instead of recording a new one.
    leaveId?: number;
    typeId?: number;
    startDate?: string;
    endDate?: string;
    dayPart?: string;
    reason?: string;
    hasCertificate?: boolean;
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
    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        employee_id: '',
        leave_type_id: '',
        start_date: '',
        end_date: '',
        day_part: 'full',
        reason: '',
        has_certificate: false as boolean,
    });

    const isEdit = !!target?.leaveId;

    useEffect(() => {
        if (target) {
            clearErrors();
            setData({
                employee_id: String(target.employeeId),
                leave_type_id: target.typeId ? String(target.typeId) : '',
                start_date: target.startDate ?? target.date,
                end_date: target.endDate ?? target.date,
                day_part: target.dayPart ?? 'full',
                reason: target.reason ?? '',
                has_certificate: target.hasCertificate ?? false,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target]);

    const selectedType = useMemo(() => leaveTypes.find((t) => String(t.id) === data.leave_type_id), [leaveTypes, data.leave_type_id]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const opts = {
            preserveScroll: true,
            onSuccess: () => {
                reset();
                onClose();
            },
        };
        if (isEdit && target) {
            put(route('leave.admin.update', target.leaveId), opts);
        } else {
            post(route('leave.admin.record'), opts);
        }
    };

    const remove = () => {
        if (target?.leaveId && confirm('Hapus data cuti ini? Saldo akan dikembalikan.')) {
            router.delete(route('leave.admin.destroy', target.leaveId), {
                preserveScroll: true,
                onSuccess: () => onClose(),
            });
        }
    };

    return (
        <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Ubah Cuti / Absen' : 'Catat Cuti / Absen'}</DialogTitle>
                    <DialogDescription>
                        {target?.employeeName}.{' '}
                        {isEdit
                            ? <>Mengubah data cuti yang sudah disetujui. Saldo akan disesuaikan otomatis.</>
                            : <>Cuti langsung <b>disetujui</b> dan masuk ke daftar pengajuan.</>}
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

                    {selectedType?.code === 'SICK' && (
                        <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                            <Checkbox checked={data.has_certificate} onCheckedChange={(v) => setData('has_certificate', v === true)} />
                            <span>Ada surat dokter (mempengaruhi potongan: dengan surat hanya potong TM, tanpa surat potong cuti/GTM).</span>
                        </label>
                    )}

                    <div className="grid gap-2">
                        <Label htmlFor="al_reason">Keterangan</Label>
                        <Textarea id="al_reason" value={data.reason} onChange={(e) => setData('reason', e.target.value)} rows={2} placeholder="Opsional (mis. sakit, izin keluarga)" />
                        <InputError message={errors.reason} />
                    </div>

                    <DialogFooter className="sm:justify-between">
                        {isEdit ? (
                            <Button type="button" variant="outline" className="text-rose-600" onClick={remove}>
                                Hapus
                            </Button>
                        ) : <span />}
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" onClick={onClose}>
                                Batal
                            </Button>
                            <Button type="submit" disabled={processing}>
                                {isEdit ? 'Simpan Perubahan' : 'Simpan & Setujui'}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
