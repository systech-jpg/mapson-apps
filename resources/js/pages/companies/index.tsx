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

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Companies', href: '/companies' }];

interface CompanyRow {
    id: number;
    code: string | null;
    name: string;
    legal_name: string | null;
    tax_id: string | null;
    phone: string | null;
    email: string | null;
    is_active: boolean;
}

export default function CompaniesIndex({ companies }: { companies: CompanyRow[] }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<CompanyRow | null>(null);

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        code: '',
        name: '',
        legal_name: '',
        tax_id: '',
        address: '',
        phone: '',
        email: '',
        is_active: true as boolean,
    });

    const openCreate = () => {
        reset();
        clearErrors();
        setEditing(null);
        setOpen(true);
    };

    const openEdit = (c: CompanyRow) => {
        clearErrors();
        setEditing(c);
        setData({
            code: c.code ?? '',
            name: c.name,
            legal_name: c.legal_name ?? '',
            tax_id: c.tax_id ?? '',
            address: '',
            phone: c.phone ?? '',
            email: c.email ?? '',
            is_active: c.is_active,
        });
        setOpen(true);
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const opts = { onSuccess: () => setOpen(false) };
        editing ? put(route('companies.update', editing.id), opts) : post(route('companies.store'), opts);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Companies" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-xl font-semibold">Companies</h1>
                    <Can on="companies" do="create">
                        <Button onClick={openCreate}>
                            <Plus className="size-4" /> Tambah Company
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
                                    <TableHead>Nama Legal</TableHead>
                                    <TableHead>NPWP</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {companies.map((c) => (
                                    <TableRow key={c.id}>
                                        <TableCell>{c.code ?? '-'}</TableCell>
                                        <TableCell className="font-medium">{c.name}</TableCell>
                                        <TableCell>{c.legal_name ?? '-'}</TableCell>
                                        <TableCell>{c.tax_id ?? '-'}</TableCell>
                                        <TableCell>
                                            <Badge variant={c.is_active ? 'default' : 'secondary'}>{c.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Can on="companies" do="edit">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                                                        <Pencil className="size-4" />
                                                    </Button>
                                                </Can>
                                                <Can on="companies" do="delete">
                                                    <ConfirmDelete url={route('companies.destroy', c.id)} title={`Hapus company ${c.name}?`} />
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
                        <DialogTitle>{editing ? 'Ubah Company' : 'Tambah Company'}</DialogTitle>
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
                        <div className="grid gap-2">
                            <Label htmlFor="legal_name">Nama Legal</Label>
                            <Input id="legal_name" value={data.legal_name} onChange={(e) => setData('legal_name', e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="tax_id">NPWP</Label>
                                <Input id="tax_id" value={data.tax_id} onChange={(e) => setData('tax_id', e.target.value)} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="phone">Telepon</Label>
                                <Input id="phone" value={data.phone} onChange={(e) => setData('phone', e.target.value)} />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} />
                            <InputError message={errors.email} />
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
