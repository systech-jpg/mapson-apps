import { Can } from '@/components/can';
import { ConfirmDelete } from '@/components/confirm-delete';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useForm } from '@inertiajs/react';
import { Pencil, Plus } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

export interface EmployeeContractRow {
    id: number;
    contract_type: string;
    number: string | null;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean;
    notes: string | null;
    creator?: { id: number; name: string } | null;
}

const TYPES = ['PKWT', 'PKWTT', 'probation'];

const dateOnly = (v: string | null) => (v ? v.substring(0, 10) : '');

function endBadge(c: EmployeeContractRow) {
    if (!c.end_date) return <Badge variant="secondary">Permanen</Badge>;
    const end = new Date(c.end_date);
    const days = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
    if (days < 0) return <Badge variant="destructive">Berakhir</Badge>;
    if (days <= 30) return <Badge className="bg-amber-500 text-white">≤ {days} hari</Badge>;
    return <Badge variant="outline">{dateOnly(c.end_date)}</Badge>;
}

export default function ContractsTab({ employeeId, contracts }: { employeeId: number; contracts: EmployeeContractRow[] }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<EmployeeContractRow | null>(null);

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        contract_type: 'PKWT',
        number: '',
        start_date: '',
        end_date: '',
        is_current: true as boolean,
        notes: '',
    });

    const openCreate = () => {
        reset();
        clearErrors();
        setEditing(null);
        setOpen(true);
    };

    const openEdit = (c: EmployeeContractRow) => {
        clearErrors();
        setEditing(c);
        setData({
            contract_type: c.contract_type,
            number: c.number ?? '',
            start_date: dateOnly(c.start_date),
            end_date: dateOnly(c.end_date),
            is_current: c.is_current,
            notes: c.notes ?? '',
        });
        setOpen(true);
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        editing
            ? put(route('employees.contracts.update', [employeeId, editing.id]), opts)
            : post(route('employees.contracts.store', employeeId), opts);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Kontrak Kerja</CardTitle>
                <Can on="employees" do="edit">
                    <Button size="sm" onClick={openCreate}>
                        <Plus className="size-4" /> Tambah Kontrak
                    </Button>
                </Can>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Tipe</TableHead>
                            <TableHead>No Dokumen</TableHead>
                            <TableHead>Mulai</TableHead>
                            <TableHead>Berakhir</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Catatan</TableHead>
                            <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {contracts.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground">
                                    Belum ada kontrak. Tambahkan PKWT/PKWTT pertama.
                                </TableCell>
                            </TableRow>
                        )}
                        {contracts.map((c) => (
                            <TableRow key={c.id}>
                                <TableCell>
                                    <Badge variant={c.contract_type === 'PKWTT' ? 'default' : 'secondary'}>{c.contract_type}</Badge>
                                </TableCell>
                                <TableCell className="max-w-[260px] truncate" title={c.number ?? ''}>{c.number ?? '-'}</TableCell>
                                <TableCell>{dateOnly(c.start_date) || '-'}</TableCell>
                                <TableCell>{endBadge(c)}</TableCell>
                                <TableCell>{c.is_current ? <Badge>Aktif</Badge> : <span className="text-xs text-muted-foreground">Riwayat</span>}</TableCell>
                                <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={c.notes ?? ''}>{c.notes ?? '-'}</TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <Can on="employees" do="edit">
                                            <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                                                <Pencil className="size-4" />
                                            </Button>
                                        </Can>
                                        <Can on="employees" do="delete">
                                            <ConfirmDelete url={route('employees.contracts.destroy', [employeeId, c.id])} title="Hapus kontrak ini?" />
                                        </Can>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Ubah Kontrak' : 'Tambah Kontrak'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="contract_type">Tipe *</Label>
                                <Select value={data.contract_type} onValueChange={(v) => setData('contract_type', v)}>
                                    <SelectTrigger id="contract_type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TYPES.map((t) => (
                                            <SelectItem key={t} value={t}>
                                                {t === 'probation' ? 'Masa Percobaan' : t}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <InputError message={errors.contract_type} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="number">No Dokumen</Label>
                                <Input id="number" value={data.number} onChange={(e) => setData('number', e.target.value)} placeholder="mis. 271/PT MAP-S/HR/INT/PKWTT/V/2025" />
                                <InputError message={errors.number} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="start_date">Tanggal Mulai *</Label>
                                <Input id="start_date" type="date" value={data.start_date} onChange={(e) => setData('start_date', e.target.value)} required />
                                <InputError message={errors.start_date} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="end_date">Tanggal Berakhir</Label>
                                <Input id="end_date" type="date" value={data.end_date} onChange={(e) => setData('end_date', e.target.value)} />
                                <span className="text-xs text-muted-foreground">Kosongkan untuk PKWTT/permanen.</span>
                                <InputError message={errors.end_date} />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="notes">Catatan</Label>
                            <Input id="notes" value={data.notes} onChange={(e) => setData('notes', e.target.value)} placeholder="mis. perpanjangan ke-2" />
                        </div>
                        <div className="flex items-center gap-3">
                            <Switch id="is_current" checked={data.is_current} onCheckedChange={(v) => setData('is_current', v)} />
                            <Label htmlFor="is_current">Jadikan kontrak aktif (kontrak lain otomatis jadi riwayat)</Label>
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={processing}>
                                Simpan
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
