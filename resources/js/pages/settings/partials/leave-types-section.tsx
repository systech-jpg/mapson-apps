import { Can } from '@/components/can';
import { ConfirmDelete } from '@/components/confirm-delete';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useForm } from '@inertiajs/react';
import { Pencil, Plus } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

interface LeaveType {
    id: number; code: string; name: string; unit: string; is_paid: boolean; requires_balance: boolean;
    requires_attachment: boolean; allow_half_day: boolean; gender_constraint: string; default_quota: string | number;
    accrual_method: string; min_notice_days: number; max_consecutive_days: number | null; carry_over_max: string | number;
    carry_over_expire_month: number | null; color: string | null; is_active: boolean;
}

const ACCRUAL: Record<string, string> = { none: 'Tidak ada', lump_sum: 'Lump-sum', prorata: 'Pro-rata', tenure_based: 'Berdasar masa kerja' };

export default function LeaveTypesSection({ types }: { types: LeaveType[] }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<LeaveType | null>(null);

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm<Record<string, string | boolean | number | null>>({
        code: '', name: '', unit: 'day', is_paid: true, requires_balance: false, requires_attachment: false,
        allow_half_day: false, gender_constraint: 'any', default_quota: 0, accrual_method: 'none',
        min_notice_days: 0, max_consecutive_days: '', carry_over_max: 0, carry_over_expire_month: '', color: '', is_active: true,
    });

    const openCreate = () => { reset(); clearErrors(); setEditing(null); setOpen(true); };
    const openEdit = (t: LeaveType) => {
        clearErrors(); setEditing(t);
        setData({
            code: t.code, name: t.name, unit: t.unit, is_paid: t.is_paid, requires_balance: t.requires_balance,
            requires_attachment: t.requires_attachment, allow_half_day: t.allow_half_day, gender_constraint: t.gender_constraint,
            default_quota: Number(t.default_quota), accrual_method: t.accrual_method, min_notice_days: t.min_notice_days,
            max_consecutive_days: t.max_consecutive_days ?? '', carry_over_max: Number(t.carry_over_max),
            carry_over_expire_month: t.carry_over_expire_month ?? '', color: t.color ?? '', is_active: t.is_active,
        });
        setOpen(true);
    };
    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        editing ? put(route('leave-types.update', editing.id), opts) : post(route('leave-types.store'), opts);
    };

    return (
        <Card>
            <CardContent className="py-5">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-semibold">Jenis Cuti</h2>
                        <p className="text-sm text-muted-foreground">Master jenis cuti, kuota, dan aturannya.</p>
                    </div>
                    <Can on="hr-settings" do="create"><Button onClick={openCreate}><Plus className="size-4" /> Tambah</Button></Can>
                </div>

                <div className="overflow-x-auto rounded-md border">
                    <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead className="text-right">Kuota</TableHead>
                                <TableHead>Akrual</TableHead><TableHead>Saldo</TableHead><TableHead>Lampiran</TableHead>
                                <TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {types.map((t) => (
                                <TableRow key={t.id}>
                                    <TableCell className="font-mono text-xs">{t.code}</TableCell>
                                    <TableCell className="font-medium">{t.name}{t.gender_constraint !== 'any' && <span className="ml-1 text-xs text-muted-foreground">[{t.gender_constraint}]</span>}</TableCell>
                                    <TableCell className="text-right">{Number(t.default_quota)}</TableCell>
                                    <TableCell className="text-xs">{ACCRUAL[t.accrual_method]}</TableCell>
                                    <TableCell>{t.requires_balance ? '✅' : '–'}</TableCell>
                                    <TableCell>{t.requires_attachment ? 'wajib' : '–'}</TableCell>
                                    <TableCell><Badge variant={t.is_active ? 'default' : 'secondary'}>{t.is_active ? 'Aktif' : 'Nonaktif'}</Badge></TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Can on="hr-settings" do="edit"><Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="size-4" /></Button></Can>
                                            <Can on="hr-settings" do="delete"><ConfirmDelete url={route('leave-types.destroy', t.id)} title={`Hapus ${t.name}?`} description="Jika sudah dipakai, akan dinonaktifkan." /></Can>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader><DialogTitle>{editing ? 'Ubah Jenis Cuti' : 'Tambah Jenis Cuti'}</DialogTitle></DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2"><Label htmlFor="code">Kode *</Label><Input id="code" value={data.code as string} onChange={(e) => setData('code', e.target.value.toUpperCase())} required /><InputError message={errors.code} /></div>
                            <div className="grid gap-2"><Label htmlFor="name">Nama *</Label><Input id="name" value={data.name as string} onChange={(e) => setData('name', e.target.value)} required /><InputError message={errors.name} /></div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="grid gap-2"><Label>Satuan</Label>
                                <Select value={data.unit as string} onValueChange={(v) => setData('unit', v)}><SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="day">Hari</SelectItem><SelectItem value="hour">Jam</SelectItem></SelectContent></Select>
                            </div>
                            <div className="grid gap-2"><Label htmlFor="default_quota">Kuota/thn</Label><Input id="default_quota" type="number" step="0.5" value={data.default_quota as number} onChange={(e) => setData('default_quota', Number(e.target.value))} /></div>
                            <div className="grid gap-2"><Label>Akrual</Label>
                                <Select value={data.accrual_method as string} onValueChange={(v) => setData('accrual_method', v)}><SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>{Object.entries(ACCRUAL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="grid gap-2"><Label>Gender</Label>
                                <Select value={data.gender_constraint as string} onValueChange={(v) => setData('gender_constraint', v)}><SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="any">Semua</SelectItem><SelectItem value="male">Pria</SelectItem><SelectItem value="female">Wanita</SelectItem></SelectContent></Select>
                            </div>
                            <div className="grid gap-2"><Label htmlFor="min_notice_days">Min H-</Label><Input id="min_notice_days" type="number" value={data.min_notice_days as number} onChange={(e) => setData('min_notice_days', Number(e.target.value))} /></div>
                            <div className="grid gap-2"><Label htmlFor="max_consecutive_days">Maks berturut</Label><Input id="max_consecutive_days" type="number" value={data.max_consecutive_days as number} onChange={(e) => setData('max_consecutive_days', e.target.value === '' ? '' : Number(e.target.value))} placeholder="∞" /></div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="grid gap-2"><Label htmlFor="carry_over_max">Carry-over maks</Label><Input id="carry_over_max" type="number" step="0.5" value={data.carry_over_max as number} onChange={(e) => setData('carry_over_max', Number(e.target.value))} /></div>
                            <div className="grid gap-2"><Label htmlFor="carry_over_expire_month">Bulan kadaluarsa</Label><Input id="carry_over_expire_month" type="number" min="1" max="12" value={data.carry_over_expire_month as number} onChange={(e) => setData('carry_over_expire_month', e.target.value === '' ? '' : Number(e.target.value))} placeholder="–" /></div>
                            <div className="grid gap-2"><Label htmlFor="color">Warna</Label><Input id="color" value={data.color as string} onChange={(e) => setData('color', e.target.value)} placeholder="#2563eb" /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            <label className="flex items-center gap-2"><Switch checked={data.is_paid as boolean} onCheckedChange={(v) => setData('is_paid', v)} /> Berbayar</label>
                            <label className="flex items-center gap-2"><Switch checked={data.requires_balance as boolean} onCheckedChange={(v) => setData('requires_balance', v)} /> Pakai saldo</label>
                            <label className="flex items-center gap-2"><Switch checked={data.requires_attachment as boolean} onCheckedChange={(v) => setData('requires_attachment', v)} /> Lampiran wajib</label>
                            <label className="flex items-center gap-2"><Switch checked={data.allow_half_day as boolean} onCheckedChange={(v) => setData('allow_half_day', v)} /> Setengah hari</label>
                            <label className="flex items-center gap-2"><Switch checked={data.is_active as boolean} onCheckedChange={(v) => setData('is_active', v)} /> Aktif</label>
                        </div>
                        <DialogFooter><Button type="submit" disabled={processing}>Simpan</Button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
