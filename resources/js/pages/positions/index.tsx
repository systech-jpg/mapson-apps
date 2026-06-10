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

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Positions', href: '/positions' }];
const NONE = 'none';

interface PositionRow {
    id: number;
    name: string;
    code: string | null;
    org_unit_id: number | null;
    job_catalog_id: number | null;
    job_grade_id: number | null;
    location_id: number | null;
    company_id: number | null;
    headcount: number;
    is_active: boolean;
    employees_count: number;
    org_unit?: Lookup | null;
    job?: Lookup | null;
    job_grade?: Lookup | null;
    location?: Lookup | null;
}

interface Props {
    positions: PositionRow[];
    orgUnits: Lookup[];
    jobs: Lookup[];
    jobGrades: Lookup[];
    locations: Lookup[];
    companies: Lookup[];
}

export default function PositionsIndex({ positions, orgUnits, jobs, jobGrades, locations, companies }: Props) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<PositionRow | null>(null);

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        name: '',
        code: '',
        company_id: '' as string,
        org_unit_id: '' as string,
        job_catalog_id: '' as string,
        job_grade_id: '' as string,
        location_id: '' as string,
        headcount: 1,
        is_active: true as boolean,
    });

    const openCreate = () => {
        reset();
        clearErrors();
        setEditing(null);
        setOpen(true);
    };

    const openEdit = (p: PositionRow) => {
        clearErrors();
        setEditing(p);
        setData({
            name: p.name,
            code: p.code ?? '',
            company_id: p.company_id ? String(p.company_id) : '',
            org_unit_id: p.org_unit_id ? String(p.org_unit_id) : '',
            job_catalog_id: p.job_catalog_id ? String(p.job_catalog_id) : '',
            job_grade_id: p.job_grade_id ? String(p.job_grade_id) : '',
            location_id: p.location_id ? String(p.location_id) : '',
            headcount: p.headcount,
            is_active: p.is_active,
        });
        setOpen(true);
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const opts = { onSuccess: () => setOpen(false) };
        editing ? put(route('positions.update', editing.id), opts) : post(route('positions.store'), opts);
    };

    const selectField = (id: string, label: string, value: string, options: Lookup[], onChange: (v: string) => void) => (
        <div className="grid gap-2">
            <Label htmlFor={id}>{label}</Label>
            <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
                <SelectTrigger id={id}>
                    <SelectValue placeholder={`Pilih ${label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NONE}>- Tidak ada -</SelectItem>
                    {options.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>
                            {o.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Positions" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-xl font-semibold">Positions</h1>
                    <Can on="positions" do="create">
                        <Button onClick={openCreate}>
                            <Plus className="size-4" /> Tambah Position
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
                                    <TableHead>Unit</TableHead>
                                    <TableHead>Grade</TableHead>
                                    <TableHead>Lokasi</TableHead>
                                    <TableHead>Karyawan</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {positions.map((p) => (
                                    <TableRow key={p.id}>
                                        <TableCell>{p.code ?? '-'}</TableCell>
                                        <TableCell className="font-medium">{p.name}</TableCell>
                                        <TableCell>{p.org_unit?.name ?? '-'}</TableCell>
                                        <TableCell>{p.job_grade?.name ?? '-'}</TableCell>
                                        <TableCell>{p.location?.name ?? '-'}</TableCell>
                                        <TableCell>{p.employees_count}</TableCell>
                                        <TableCell>
                                            <Badge variant={p.is_active ? 'default' : 'secondary'}>{p.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Can on="positions" do="edit">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                                                        <Pencil className="size-4" />
                                                    </Button>
                                                </Can>
                                                <Can on="positions" do="delete">
                                                    <ConfirmDelete url={route('positions.destroy', p.id)} title={`Hapus position ${p.name}?`} />
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
                        <DialogTitle>{editing ? 'Ubah Position' : 'Tambah Position'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="code">Kode</Label>
                                <Input id="code" value={data.code} onChange={(e) => setData('code', e.target.value)} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="name">Nama</Label>
                                <Input id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} required />
                                <InputError message={errors.name} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {selectField('company_id', 'Company', data.company_id, companies, (v) => setData('company_id', v))}
                            {selectField('org_unit_id', 'Unit', data.org_unit_id, orgUnits, (v) => setData('org_unit_id', v))}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {selectField('job_catalog_id', 'Job', data.job_catalog_id, jobs, (v) => setData('job_catalog_id', v))}
                            {selectField('job_grade_id', 'Grade', data.job_grade_id, jobGrades, (v) => setData('job_grade_id', v))}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {selectField('location_id', 'Lokasi', data.location_id, locations, (v) => setData('location_id', v))}
                            <div className="grid gap-2">
                                <Label htmlFor="headcount">Headcount</Label>
                                <Input id="headcount" type="number" min={1} value={data.headcount} onChange={(e) => setData('headcount', Number(e.target.value))} />
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Switch id="is_active" checked={data.is_active} onCheckedChange={(v) => setData('is_active', v)} />
                            <Label htmlFor="is_active">Aktif</Label>
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
