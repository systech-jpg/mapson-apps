import { Can } from '@/components/can';
import { ConfirmDelete } from '@/components/confirm-delete';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { Pencil, Plus } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Departments', href: '/departments' }];

interface DepartmentRow {
    id: number;
    name: string;
    code: string | null;
    is_active: boolean;
    positions_count: number;
    employees_count: number;
}

export default function DepartmentsIndex({ departments }: { departments: DepartmentRow[] }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<DepartmentRow | null>(null);

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        name: '',
        code: '',
        is_active: true as boolean,
    });

    const openCreate = () => {
        reset();
        clearErrors();
        setEditing(null);
        setOpen(true);
    };

    const openEdit = (dept: DepartmentRow) => {
        clearErrors();
        setEditing(dept);
        setData({ name: dept.name, code: dept.code ?? '', is_active: dept.is_active });
        setOpen(true);
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const options = { onSuccess: () => setOpen(false) };
        if (editing) {
            put(route('departments.update', editing.id), options);
        } else {
            post(route('departments.store'), options);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Departments" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-xl font-semibold">Departments</h1>
                    <Can on="departments" do="create">
                        <Button onClick={openCreate}>
                            <Plus className="size-4" /> Tambah Department
                        </Button>
                    </Can>
                </div>

                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nama</TableHead>
                                    <TableHead>Kode</TableHead>
                                    <TableHead>Jabatan</TableHead>
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {departments.map((dept) => (
                                    <TableRow key={dept.id}>
                                        <TableCell className="font-medium">{dept.name}</TableCell>
                                        <TableCell>{dept.code ?? '-'}</TableCell>
                                        <TableCell>{dept.positions_count}</TableCell>
                                        <TableCell>{dept.employees_count}</TableCell>
                                        <TableCell>
                                            <Badge variant={dept.is_active ? 'default' : 'secondary'}>{dept.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Can on="departments" do="edit">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(dept)}>
                                                        <Pencil className="size-4" />
                                                    </Button>
                                                </Can>
                                                <Can on="departments" do="delete">
                                                    <ConfirmDelete url={route('departments.destroy', dept.id)} title={`Hapus department ${dept.name}?`} />
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
                        <DialogTitle>{editing ? 'Ubah Department' : 'Tambah Department'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Nama</Label>
                            <Input id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} required />
                            <InputError message={errors.name} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="code">Kode</Label>
                            <Input id="code" value={data.code} onChange={(e) => setData('code', e.target.value)} />
                            <InputError message={errors.code} />
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
