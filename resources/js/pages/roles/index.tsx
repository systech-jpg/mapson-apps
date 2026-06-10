import { Can } from '@/components/can';
import { ConfirmDelete } from '@/components/confirm-delete';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { Pencil, Plus, ShieldCheck } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Roles', href: '/roles' }];

interface RoleRow {
    id: number;
    name: string;
    description: string | null;
    is_super: boolean;
    is_locked: boolean;
    is_active: boolean;
    users_count: number;
}

export default function RolesIndex({ roles }: { roles: RoleRow[] }) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Roles" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-xl font-semibold">Roles</h1>
                    <Can on="roles" do="create">
                        <Button asChild>
                            <Link href={route('roles.create')}>
                                <Plus className="size-4" /> Tambah Role
                            </Link>
                        </Button>
                    </Can>
                </div>

                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nama</TableHead>
                                <TableHead>Deskripsi</TableHead>
                                <TableHead>Jumlah User</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {roles.map((role) => (
                                <TableRow key={role.id}>
                                    <TableCell className="font-medium">
                                        {role.name} {role.is_super && <Badge className="ml-1">Super</Badge>}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{role.description ?? '-'}</TableCell>
                                    <TableCell>{role.users_count}</TableCell>
                                    <TableCell>
                                        <Badge variant={role.is_active ? 'default' : 'secondary'}>{role.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Can on="roles" do="edit">
                                                <Button variant="outline" size="sm" asChild>
                                                    <Link href={route('roles.access.edit', role.id)}>
                                                        <ShieldCheck className="size-4" /> Hak Akses
                                                    </Link>
                                                </Button>
                                            </Can>
                                            <Can on="roles" do="edit">
                                                <Button variant="ghost" size="icon" asChild>
                                                    <Link href={route('roles.edit', role.id)}>
                                                        <Pencil className="size-4" />
                                                    </Link>
                                                </Button>
                                            </Can>
                                            {!role.is_locked && !role.is_super && (
                                                <Can on="roles" do="delete">
                                                    <ConfirmDelete url={route('roles.destroy', role.id)} title={`Hapus role ${role.name}?`} />
                                                </Can>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </AppLayout>
    );
}
