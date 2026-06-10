import { Can } from '@/components/can';
import { ConfirmDelete } from '@/components/confirm-delete';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import InputError from '@/components/input-error';
import { menuIconNames } from '@/lib/menu-icons';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { Pencil, Plus } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Menus', href: '/menus' }];

interface MenuRow {
    id: number;
    parent_id: number | null;
    title: string;
    key: string;
    route: string | null;
    icon: string | null;
    sort_order: number;
    is_active: boolean;
}

const NONE = 'none';

export default function MenusIndex({ menus }: { menus: MenuRow[] }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<MenuRow | null>(null);

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        parent_id: '' as string,
        title: '',
        key: '',
        route: '',
        icon: '',
        sort_order: 0,
        is_active: true as boolean,
    });

    const openCreate = () => {
        reset();
        clearErrors();
        setEditing(null);
        setOpen(true);
    };

    const openEdit = (menu: MenuRow) => {
        clearErrors();
        setEditing(menu);
        setData({
            parent_id: menu.parent_id ? String(menu.parent_id) : '',
            title: menu.title,
            key: menu.key,
            route: menu.route ?? '',
            icon: menu.icon ?? '',
            sort_order: menu.sort_order,
            is_active: menu.is_active,
        });
        setOpen(true);
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const options = { onSuccess: () => setOpen(false) };
        if (editing) {
            put(route('menus.update', editing.id), options);
        } else {
            post(route('menus.store'), options);
        }
    };

    const parentOptions = menus.filter((m) => !editing || m.id !== editing.id);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Menus" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-xl font-semibold">Menus</h1>
                    <Can on="menus" do="create">
                        <Button onClick={openCreate}>
                            <Plus className="size-4" /> Tambah Menu
                        </Button>
                    </Can>
                </div>

                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Title</TableHead>
                                    <TableHead>Key</TableHead>
                                    <TableHead>Route</TableHead>
                                    <TableHead>Icon</TableHead>
                                    <TableHead>Urutan</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {menus.map((menu) => (
                                    <TableRow key={menu.id}>
                                        <TableCell className="font-medium" style={{ paddingLeft: menu.parent_id ? 32 : undefined }}>
                                            {menu.parent_id ? '— ' : ''}
                                            {menu.title}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{menu.key}</TableCell>
                                        <TableCell className="text-muted-foreground">{menu.route ?? '-'}</TableCell>
                                        <TableCell>{menu.icon ?? '-'}</TableCell>
                                        <TableCell>{menu.sort_order}</TableCell>
                                        <TableCell>
                                            <Badge variant={menu.is_active ? 'default' : 'secondary'}>{menu.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Can on="menus" do="edit">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(menu)}>
                                                        <Pencil className="size-4" />
                                                    </Button>
                                                </Can>
                                                <Can on="menus" do="delete">
                                                    <ConfirmDelete url={route('menus.destroy', menu.id)} title={`Hapus menu ${menu.title}?`} description="Menghapus module juga menghapus seluruh sub-menunya." />
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
                        <DialogTitle>{editing ? 'Ubah Menu' : 'Tambah Menu'}</DialogTitle>
                        <DialogDescription>Module = menu tanpa route. Sub-menu pilih parent module-nya.</DialogDescription>
                    </DialogHeader>

                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="title">Title</Label>
                            <Input id="title" value={data.title} onChange={(e) => setData('title', e.target.value)} required />
                            <InputError message={errors.title} />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="key">Key (unik, dipakai untuk hak akses)</Label>
                            <Input id="key" value={data.key} onChange={(e) => setData('key', e.target.value)} required />
                            <InputError message={errors.key} />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="route">Route name (kosongkan untuk module)</Label>
                            <Input id="route" value={data.route} onChange={(e) => setData('route', e.target.value)} placeholder="contoh: users.index" />
                            <InputError message={errors.route} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="parent_id">Parent</Label>
                                <Select value={data.parent_id || NONE} onValueChange={(v) => setData('parent_id', v === NONE ? '' : v)}>
                                    <SelectTrigger id="parent_id">
                                        <SelectValue placeholder="Tanpa parent (module)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>- Tanpa parent (module) -</SelectItem>
                                        {parentOptions.map((m) => (
                                            <SelectItem key={m.id} value={String(m.id)}>
                                                {m.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <InputError message={errors.parent_id} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="icon">Icon</Label>
                                <Select value={data.icon || NONE} onValueChange={(v) => setData('icon', v === NONE ? '' : v)}>
                                    <SelectTrigger id="icon">
                                        <SelectValue placeholder="Pilih icon" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>- Tanpa icon -</SelectItem>
                                        {menuIconNames.map((name) => (
                                            <SelectItem key={name} value={name}>
                                                {name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <InputError message={errors.icon} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 items-end gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="sort_order">Urutan</Label>
                                <Input id="sort_order" type="number" value={data.sort_order} onChange={(e) => setData('sort_order', Number(e.target.value))} />
                                <InputError message={errors.sort_order} />
                            </div>
                            <div className="flex items-center gap-3 pb-2">
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
