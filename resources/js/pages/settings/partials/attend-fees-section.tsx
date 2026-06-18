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

interface Tier {
    id: number;
    tier: number;
    label: string;
    fee_workday: string | number;
    fee_holiday: string | number;
    basis: 'tindakan' | 'invoice';
    is_active: boolean;
}

const rupiah = (v: string | number) => 'Rp ' + Number(v).toLocaleString('id-ID');
const BASIS_LABEL: Record<string, string> = { tindakan: 'Per Tindakan', invoice: 'Per Invoice' };

export default function AttendFeesSection({ tiers }: { tiers: Tier[] }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Tier | null>(null);
    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm<Record<string, string | number | boolean>>({
        tier: '', label: '', fee_workday: 0, fee_holiday: 0, basis: 'tindakan', is_active: true,
    });

    const openCreate = () => {
        reset(); clearErrors(); setEditing(null);
        setData({ tier: (Math.max(0, ...tiers.map((t) => t.tier)) + 1), label: '', fee_workday: 0, fee_holiday: 0, basis: 'tindakan', is_active: true });
        setOpen(true);
    };
    const openEdit = (t: Tier) => {
        clearErrors(); setEditing(t);
        setData({ tier: t.tier, label: t.label, fee_workday: Number(t.fee_workday), fee_holiday: Number(t.fee_holiday), basis: t.basis, is_active: t.is_active });
        setOpen(true);
    };
    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        editing ? put(route('hr-settings.attend-tiers.update', editing.id), opts) : post(route('hr-settings.attend-tiers.store'), opts);
    };

    return (
        <Card>
            <CardContent className="py-5">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-semibold">Fee Attend Case (Tier)</h2>
                        <p className="text-sm text-muted-foreground">
                            Tier bebas. Tiap tier punya fee per case <b>hari kerja</b> & <b>tanggal merah</b> (Sabtu/Minggu + libur nasional).
                            Basis <b>Per Tindakan</b> dihitung bulanan dari data ERP; <b>Per Invoice</b> dihitung terpisah (menyusul).
                        </p>
                    </div>
                    <Can on="hr-settings" do="create"><Button onClick={openCreate}><Plus className="size-4" /> Tambah Tier</Button></Can>
                </div>

                <div className="overflow-x-auto rounded-md border">
                    <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-16 text-center">Tier</TableHead>
                                <TableHead>Nama</TableHead>
                                <TableHead className="text-right">Fee Hari Kerja</TableHead>
                                <TableHead className="text-right">Fee Tanggal Merah</TableHead>
                                <TableHead>Basis</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tiers.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Belum ada tier.</TableCell></TableRow>
                            ) : tiers.map((t) => (
                                <TableRow key={t.id}>
                                    <TableCell className="text-center font-mono">{t.tier}</TableCell>
                                    <TableCell className="font-medium">{t.label}</TableCell>
                                    <TableCell className="text-right font-mono">{rupiah(t.fee_workday)}</TableCell>
                                    <TableCell className="text-right font-mono">{rupiah(t.fee_holiday)}</TableCell>
                                    <TableCell><Badge variant={t.basis === 'invoice' ? 'outline' : 'secondary'}>{BASIS_LABEL[t.basis]}</Badge></TableCell>
                                    <TableCell><Badge variant={t.is_active ? 'default' : 'secondary'}>{t.is_active ? 'Aktif' : 'Nonaktif'}</Badge></TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Can on="hr-settings" do="edit"><Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="size-4" /></Button></Can>
                                            <Can on="hr-settings" do="delete"><ConfirmDelete url={route('hr-settings.attend-tiers.destroy', t.id)} title={`Hapus tier ${t.label}?`} /></Can>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editing ? 'Ubah Tier' : 'Tambah Tier'}</DialogTitle></DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="grid gap-2"><Label htmlFor="tier">No. Tier *</Label><Input id="tier" type="number" min="1" value={data.tier as number} onChange={(e) => setData('tier', Number(e.target.value))} required /><InputError message={errors.tier} /></div>
                            <div className="col-span-2 grid gap-2"><Label htmlFor="label">Nama *</Label><Input id="label" value={data.label as string} onChange={(e) => setData('label', e.target.value)} placeholder="mis. Manager" required /><InputError message={errors.label} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2"><Label htmlFor="fw">Fee Hari Kerja (Rp/case) *</Label><Input id="fw" type="number" min="0" step="any" value={data.fee_workday as number} onChange={(e) => setData('fee_workday', e.target.value)} required /><InputError message={errors.fee_workday} /></div>
                            <div className="grid gap-2"><Label htmlFor="fh">Fee Tanggal Merah (Rp/case) *</Label><Input id="fh" type="number" min="0" step="any" value={data.fee_holiday as number} onChange={(e) => setData('fee_holiday', e.target.value)} required /><InputError message={errors.fee_holiday} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Basis Perhitungan</Label>
                                <Select value={data.basis as string} onValueChange={(v) => setData('basis', v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="tindakan">Per Tindakan (bulanan)</SelectItem>
                                        <SelectItem value="invoice">Per Invoice (carry-over)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <label className="mt-6 flex items-center gap-2"><Switch checked={data.is_active as boolean} onCheckedChange={(v) => setData('is_active', v)} /> Aktif</label>
                        </div>
                        <DialogFooter><Button type="submit" disabled={processing}>Simpan</Button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
