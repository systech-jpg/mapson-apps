import { Can } from '@/components/can';
import { ConfirmDelete } from '@/components/confirm-delete';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type Paginated, type User } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Pencil, Plus, Search } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Users', href: '/users' }];

interface Props {
    users: Paginated<User>;
    filters: { search: string };
}

export default function UsersIndex({ users, filters }: Props) {
    const [search, setSearch] = useState(filters.search ?? '');

    const submitSearch: FormEventHandler = (e) => {
        e.preventDefault();
        router.get(route('users.index'), { search }, { preserveState: true, replace: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Users" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-xl font-semibold">Users</h1>
                    <Can on="users" do="create">
                        <Button asChild>
                            <Link href={route('users.create')}>
                                <Plus className="size-4" /> Tambah User
                            </Link>
                        </Button>
                    </Can>
                </div>

                <form onSubmit={submitSearch} className="flex max-w-sm items-center gap-2">
                    <Input placeholder="Cari nama atau email..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    <Button type="submit" variant="outline" size="icon">
                        <Search className="size-4" />
                    </Button>
                </form>

                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nama</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Departemen</TableHead>
                                <TableHead>Jabatan</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                                        Tidak ada data.
                                    </TableCell>
                                </TableRow>
                            )}
                            {users.data.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-medium">{user.name}</TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>{user.role?.name ?? '-'}</TableCell>
                                    <TableCell>{user.employee?.department?.name ?? '-'}</TableCell>
                                    <TableCell>{user.employee?.position?.name ?? '-'}</TableCell>
                                    <TableCell>
                                        <Badge variant={user.is_active ? 'default' : 'secondary'}>{user.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Can on="users" do="edit">
                                                <Button variant="ghost" size="icon" asChild>
                                                    <Link href={route('users.edit', user.id)}>
                                                        <Pencil className="size-4" />
                                                    </Link>
                                                </Button>
                                            </Can>
                                            <Can on="users" do="delete">
                                                <ConfirmDelete url={route('users.destroy', user.id)} title={`Hapus user ${user.name}?`} />
                                            </Can>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <Pagination links={users.links} />
            </div>
        </AppLayout>
    );
}
