import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import InputError from '@/components/input-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type Lookup } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { type FormEventHandler } from 'react';
import AssignmentFields, { type AssignmentOptions } from './partials/assignment-fields';
import PersonalFields from './partials/personal-fields';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Employees', href: '/employees' },
    { title: 'Tambah', href: '/employees/create' },
];

interface Props extends AssignmentOptions {
    linkableUsers: (Lookup & { email?: string })[];
}

export default function CreateEmployee(props: Props) {
    const { data, setData, post, processing, errors } = useForm<Record<string, string | boolean>>({
        employee_code: '',
        first_name: '',
        last_name: '',
        nik_ktp: '',
        npwp: '',
        gender: '',
        birth_place: '',
        birth_date: '',
        religion: '',
        marital_status: '',
        nationality: 'WNI',
        blood_type: '',
        bpjs_kesehatan_no: '',
        bpjs_ketenagakerjaan_no: '',
        is_active: true,
        user_id: '',
        valid_from: new Date().toISOString().substring(0, 10),
        company_id: '',
        org_unit_id: '',
        position_id: '',
        job_catalog_id: '',
        job_grade_id: '',
        cost_center_id: '',
        location_id: '',
        employee_group_id: '',
        employee_subgroup_id: '',
        employment_type_id: '',
        employment_status: 'active',
        reports_to_employee_id: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('employees.store'));
    };

    const options: AssignmentOptions = props;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Tambah Employee" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <h1 className="text-xl font-semibold">Tambah Employee</h1>

                <form onSubmit={submit} className="grid gap-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Data Pribadi</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <PersonalFields data={data} setData={setData} errors={errors} linkableUsers={props.linkableUsers} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Penempatan Awal (Hire)</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="grid gap-2 md:w-1/3">
                                <Label htmlFor="valid_from">Tanggal Mulai (Hire Date) *</Label>
                                <Input id="valid_from" type="date" value={data.valid_from as string} onChange={(e) => setData('valid_from', e.target.value)} required />
                                <InputError message={errors.valid_from} />
                            </div>
                            <AssignmentFields data={data} setData={setData} errors={errors} options={options} />
                        </CardContent>
                    </Card>

                    <div className="flex items-center gap-2">
                        <Button type="submit" disabled={processing}>
                            Simpan
                        </Button>
                        <Button type="button" variant="outline" asChild>
                            <Link href={route('employees.index')}>Batal</Link>
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
