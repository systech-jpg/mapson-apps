import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type DepartmentBrief, type PositionBrief, type RoleBrief, type User } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { type FormEventHandler } from 'react';
import UserFormFields, { type UserFormData } from './user-form-fields';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Users', href: '/users' },
    { title: 'Ubah', href: '#' },
];

interface Props {
    user: User;
    roles: RoleBrief[];
    departments: DepartmentBrief[];
    positions: PositionBrief[];
}

export default function EditUser({ user, roles, departments, positions }: Props) {
    const employee = user.employee;

    const { data, setData, put, processing, errors } = useForm<UserFormData>({
        name: user.name,
        email: user.email,
        password: '',
        password_confirmation: '',
        role_id: user.role_id ? String(user.role_id) : '',
        is_active: Boolean(user.is_active),
        department_id: employee?.department_id ? String(employee.department_id) : '',
        position_id: employee?.position_id ? String(employee.position_id) : '',
        employee_code: employee?.employee_code ?? '',
        phone: employee?.phone ?? '',
        hire_date: employee?.hire_date ? employee.hire_date.substring(0, 10) : '',
        address: employee?.address ?? '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        put(route('users.update', user.id));
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Ubah User - ${user.name}`} />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <h1 className="text-xl font-semibold">Ubah User</h1>

                <Card>
                    <CardContent className="pt-6">
                        <form onSubmit={submit} className="grid gap-6">
                            <UserFormFields data={data} setData={setData} errors={errors} roles={roles} departments={departments} positions={positions} isEdit />

                            <div className="flex items-center gap-2">
                                <Button type="submit" disabled={processing}>
                                    Simpan Perubahan
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
