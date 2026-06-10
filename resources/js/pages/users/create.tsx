import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type DepartmentBrief, type PositionBrief, type RoleBrief } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { type FormEventHandler } from 'react';
import UserFormFields, { type UserFormData } from './user-form-fields';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Users', href: '/users' },
    { title: 'Tambah', href: '/users/create' },
];

interface Props {
    roles: RoleBrief[];
    departments: DepartmentBrief[];
    positions: PositionBrief[];
}

export default function CreateUser({ roles, departments, positions }: Props) {
    const { data, setData, post, processing, errors } = useForm<UserFormData>({
        name: '',
        email: '',
        password: '',
        password_confirmation: '',
        role_id: '',
        is_active: true,
        department_id: '',
        position_id: '',
        employee_code: '',
        phone: '',
        hire_date: '',
        address: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('users.store'));
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Tambah User" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <h1 className="text-xl font-semibold">Tambah User</h1>

                <Card>
                    <CardContent className="pt-6">
                        <form onSubmit={submit} className="grid gap-6">
                            <UserFormFields data={data} setData={setData} errors={errors} roles={roles} departments={departments} positions={positions} />

                            <div className="flex items-center gap-2">
                                <Button type="submit" disabled={processing}>
                                    Simpan
                                </Button>
                                <Button type="button" variant="outline" asChild>
                                    <Link href={route('users.index')}>Batal</Link>
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
