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
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type Lookup } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { Pencil, Plus } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Organizational Units', href: '/org-units' }];
const NONE = 'none';
const TYPES = ['division', 'directorate', 'department', 'section', 'team'];

interface OrgUnitRow {
    id: number;
    company_id: number | null;
    parent_id: number | null;
    code: string | null;
    name: string;
    type: string;
    cost_center_id: number | null;
    sort_order: number;
    is_active: boolean;
    company?: Lookup | null;
    parent?: Lookup | null;
}

interface Props {
    orgUnits: OrgUnitRow[];
    companies: Lookup[];
    costCenters: Lookup[];
}

export default function OrgUnitsIndex({ orgUnits, companies, costCenters }: Props) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<OrgUnitRow | null>(null);

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        company_id: '' as string,
        parent_id: '' as string,
        code: '',
        name: '',
        type: 'department',
        cost_center_id: '' as string,
        sort_order: 0,
        is_active: true as boolean,
    });

    const openCreate = () => {
        reset();
        clearErrors();
        setEditing(null);
        setOpen(true);
    };

    const openEdit = (o: OrgUnitRow) => {
        clearErrors();
        setEditing(o);
        setData({
            company_id: o.company_id ? String(o.company_id) : '',
            parent_id: o.parent_id ? String(o.parent_id) : '',
            code: o.code ?? '',
            name: o.name,
            type: o.type,
            cost_center_id: o.cost_center_id ? String(o.cost_center_id) : '',
            sort_order: o.sort_order,
            is_active: o.is_active,
        });
        setOpen(true);
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const opts = { onSuccess: () => setOpen(false) };
        editing ? put(route('org-units.update', editing.id), opts) : post(route('org-units.store'), opts);
    };

    const parentOptions = orgUnits.filter((o) => !editing || o.id !== editing.id);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Organizational Units" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-xl font-semibold">Organizational Units</h1>
                    <Can on="org-units" do="create">
                        <Button onClick={openCreate}>
                            <Plus className="size-4" /> Tambah Unit
                        </Button>
                    </Can>
                </div>

                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Kode</TableHead>
                                    <TableHead>Nama</TableHead>
                                    <TableHead>Tipe</TableHead>
                                    <TableHead>Parent</TableHead>
                                    <TableHead>Company</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orgUnits.map((o) => (
                                    <TableRow key={o.id}>
                                        <TableCell>{o.code ?? '-'}</TableCell>
                                        <TableCell className="font-medium">{o.name}</TableCell>
                                        <TableCell className="capitalize">{o.type}</TableCell>
                                        <TableCell>{o.parent?.name ?? '-'}</TableCell>
                                        <TableCell>{o.company?.name ?? '-'}</TableCell>
                                        <TableCell>
                                            <Badge variant={o.is_active ? 'default' : 'secondary'}>{o.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Can on="org-units" do="edit">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(o)}>
                                                        <Pencil className="size-4" />
                                                    </Button>
                                                </Can>
                                                <Can on="org-units" do="delete">
                                                    <ConfirmDelete url={route('org-units.destroy', o.id)} title={`Hapus unit ${o.name}?`} />
                                                </Can>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Ubah Unit' : 'Tambah Unit'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="code">Kode</Label>
                                <Input id="code" value={data.code} onChange={(e) => setData('code', e.target.value)} />
                                <InputError message={errors.code} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="name">Nama</Label>
                                <Input id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} required />
                                <InputError message={errors.name} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="type">Tipe</Label>
                                <Select value={data.type} onValueChange={(v) => setData('type', v)}>
                                    <SelectTrigger id="type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TYPES.map((t) => (
                                            <SelectItem key={t} value={t} className="capitalize">
                                                {t}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="parent_id">Parent</Label>
                                <Select value={data.parent_id || NONE} onValueChange={(v) => setData('parent_id', v === NONE ? '' : v)}>
                                    <SelectTrigger id="parent_id">
                                        <SelectValue placeholder="Tanpa parent" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>- Tanpa parent -</SelectItem>
                                        {parentOptions.map((o) => (
                                            <SelectItem key={o.id} value={String(o.id)}>
                                                {o.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <InputError message={errors.parent_id} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="company_id">Company</Label>
                                <Select value={data.company_id || NONE} onValueChange={(v) => setData('company_id', v === NONE ? '' : v)}>
                                    <SelectTrigger id="company_id">
                                        <SelectValue placeholder="Pilih company" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>- Tidak ada -</SelectItem>
                                        {companies.map((c) => (
                                            <SelectItem key={c.id} value={String(c.id)}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="cost_center_id">Cost Center</Label>
                                <Select value={data.cost_center_id || NONE} onValueChange={(v) => setData('cost_center_id', v === NONE ? '' : v)}>
                                    <SelectTrigger id="cost_center_id">
                                        <SelectValue placeholder="Pilih cost center" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>- Tidak ada -</SelectItem>
                                        {costCenters.map((c) => (
                                            <SelectItem key={c.id} value={String(c.id)}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="grid gap-2">
                                <Label htmlFor="sort_order">Urutan</Label>
                                <Input id="sort_order" type="number" className="w-24" value={data.sort_order} onChange={(e) => setData('sort_order', Number(e.target.value))} />
                            </div>
                            <div className="flex items-center gap-3 pt-6">
                                <Switch id="is_active" checked={data.is_active} onCheckedChange={(v) => setData('is_active', v)} />
                                <Label htmlFor="is_active">Aktif</Label>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={processing}>
                                Simpan
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
