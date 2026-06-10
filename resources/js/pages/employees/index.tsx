import { Can } from '@/components/can';
import { ConfirmDelete } from '@/components/confirm-delete';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type Employee, type Lookup, type Paginated } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Eye, Plus, RotateCcw, Search } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Employees', href: '/employees' }];
const ALL = 'all';
const STATUSES = ['active', 'probation', 'suspended', 'terminated', 'resigned', 'retired'];

interface Props {
    employees: Paginated<Employee>;
    filters: { search: string; org_unit_id: number | null; status: string; trashed: string };
    orgUnits: Lookup[];
}

const statusVariant = (s: string | null): 'default' | 'secondary' | 'destructive' => {
    if (s === 'active') return 'default';
    if (s === 'terminated' || s === 'resigned' || s === 'retired') return 'destructive';
    return 'secondary';
};

export default function EmployeesIndex({ employees, filters, orgUnits }: Props) {
    const [search, setSearch] = useState(filters.search ?? '');

    const apply = (extra: Record<string, unknown> = {}) => {
        router.get(
            route('employees.index'),
            {
                search,
                org_unit_id: filters.org_unit_id ?? undefined,
                status: filters.status || undefined,
                trashed: filters.trashed || undefined,
                ...extra,
            },
            { preserveState: true, replace: true },
        );
    };

    const submitSearch: FormEventHandler = (e) => {
        e.preventDefault();
        apply();
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Employees" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-xl font-semibold">Employees</h1>
                    <Can on="employees" do="create">
                        <Button asChild>
                            <Link href={route('employees.create')}>
                                <Plus className="size-4" /> Tambah Employee
                            </Link>
                        </Button>
                    </Can>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                    <form onSubmit={submitSearch} className="flex items-center gap-2">
                        <Input className="w-64" placeholder="Cari nama, NIP, NIK..." value={search} onChange={(e) => setSearch(e.target.value)} />
                        <Button type="submit" variant="outline" size="icon">
                            <Search className="size-4" />
                        </Button>
                    </form>

                    <Select value={filters.org_unit_id ? String(filters.org_unit_id) : ALL} onValueChange={(v) => apply({ org_unit_id: v === ALL ? undefined : v })}>
                        <SelectTrigger className="w-52">
                            <SelectValue placeholder="Semua unit" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>Semua unit</SelectItem>
                            {orgUnits.map((o) => (
                                <SelectItem key={o.id} value={String(o.id)}>
                                    {o.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={filters.status || ALL} onValueChange={(v) => apply({ status: v === ALL ? undefined : v })}>
                        <SelectTrigger className="w-44">
                            <SelectValue placeholder="Semua status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>Semua status</SelectItem>
                            {STATUSES.map((s) => (
                                <SelectItem key={s} value={s} className="capitalize">
                                    {s}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={filters.trashed || 'none'} onValueChange={(v) => apply({ trashed: v === 'none' ? undefined : v })}>
                        <SelectTrigger className="w-40">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Aktif</SelectItem>
                            <SelectItem value="with">Termasuk terhapus</SelectItem>
                            <SelectItem value="only">Hanya terhapus</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>NIP</TableHead>
                                <TableHead>Nama</TableHead>
                                <TableHead>Unit</TableHead>
                                <TableHead>Posisi</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {employees.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                                        Tidak ada data.
                                    </TableCell>
                                </TableRow>
                            )}
                            {employees.data.map((e) => (
                                <TableRow key={e.id} className={e.deleted_at ? 'opacity-60' : ''}>
                                    <TableCell>{e.employee_code}</TableCell>
                                    <TableCell className="font-medium">{e.full_name}</TableCell>
                                    <TableCell>{e.current_org_unit?.name ?? '-'}</TableCell>
                                    <TableCell>{e.current_position?.name ?? '-'}</TableCell>
                                    <TableCell>
                                        <Badge variant={statusVariant(e.current_employment_status)} className="capitalize">
                                            {e.current_employment_status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {e.deleted_at ? (
                                                <Can on="employees" do="edit">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => router.put(route('employees.restore', e.id), {}, { preserveScroll: true })}
                                                    >
                                                        <RotateCcw className="size-4" />
                                                    </Button>
                                                </Can>
                                            ) : (
                                                <>
                                                    <Button variant="ghost" size="icon" asChild>
                                                        <Link href={route('employees.show', e.id)}>
                                                            <Eye className="size-4" />
                                                        </Link>
                                                    </Button>
                                                    <Can on="employees" do="delete">
                                                        <ConfirmDelete url={route('employees.destroy', e.id)} title={`Nonaktifkan ${e.full_name}?`} description="Employee akan di-soft delete dan bisa dipulihkan." />
                                                    </Can>
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <Pagination links={employees.links} />
            </div>
        </AppLayout>
    );
}
