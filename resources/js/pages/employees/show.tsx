import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type AuditLog, type BreadcrumbItem, type Employee, type Lookup } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { type FormEventHandler } from 'react';
import AssignmentTimeline from './partials/assignment-timeline';
import ChangeAssignmentDialog from './partials/change-assignment-dialog';
import { type AssignmentOptions } from './partials/assignment-fields';
import PersonalFields from './partials/personal-fields';

interface Props extends AssignmentOptions {
    employee: Employee;
    linkableUsers: (Lookup & { email?: string })[];
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right font-medium">{value || '-'}</span>
        </div>
    );
}

export default function ShowEmployee({ employee, linkableUsers, ...options }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Employees', href: '/employees' },
        { title: employee.full_name ?? employee.employee_code ?? 'Detail', href: '#' },
    ];

    const { data, setData, post, processing, errors } = useForm<Record<string, string | boolean | File | null>>({
        _method: 'put',
        employee_code: employee.employee_code ?? '',
        first_name: employee.first_name ?? '',
        last_name: employee.last_name ?? '',
        nik_ktp: employee.nik_ktp ?? '',
        npwp: employee.npwp ?? '',
        gender: employee.gender ?? '',
        birth_place: employee.birth_place ?? '',
        birth_date: employee.birth_date ? employee.birth_date.substring(0, 10) : '',
        religion: employee.religion ?? '',
        marital_status: employee.marital_status ?? '',
        nationality: employee.nationality ?? 'WNI',
        blood_type: employee.blood_type ?? '',
        bpjs_kesehatan_no: employee.bpjs_kesehatan_no ?? '',
        bpjs_ketenagakerjaan_no: employee.bpjs_ketenagakerjaan_no ?? '',
        is_active: Boolean(employee.is_active),
        user_id: employee.user_id ? String(employee.user_id) : '',
        photo: null,
    });

    const submitPersonal: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('employees.update', employee.id), { forceFormData: true, preserveScroll: true });
    };

    const auditLogs = (employee.audit_logs ?? []) as AuditLog[];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={employee.full_name ?? 'Employee'} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-center gap-4">
                    <Avatar className="size-16">
                        {employee.photo_path && <AvatarImage src={route('employees.photo', employee.id)} alt={employee.full_name ?? ''} />}
                        <AvatarFallback>{(employee.full_name ?? '?').substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                        <h1 className="text-xl font-semibold">{employee.full_name}</h1>
                        <p className="text-sm text-muted-foreground">
                            {employee.employee_code} · {employee.current_position?.name ?? 'Tanpa posisi'}
                        </p>
                    </div>
                    <Badge variant={employee.current_employment_status === 'active' ? 'default' : 'secondary'} className="ml-auto capitalize">
                        {employee.current_employment_status}
                    </Badge>
                </div>

                <Tabs defaultValue="personal">
                    <TabsList>
                        <TabsTrigger value="personal">Data Pribadi</TabsTrigger>
                        <TabsTrigger value="organization">Organisasi & Riwayat</TabsTrigger>
                        <TabsTrigger value="audit">Audit Log</TabsTrigger>
                    </TabsList>

                    <TabsContent value="personal">
                        <Card>
                            <CardContent className="pt-6">
                                <form onSubmit={submitPersonal} className="grid gap-4">
                                    <PersonalFields data={data} setData={setData} errors={errors} linkableUsers={linkableUsers} />
                                    <div className="grid gap-2 md:w-1/3">
                                        <Label htmlFor="photo">Foto</Label>
                                        <Input id="photo" type="file" accept="image/*" onChange={(e) => setData('photo', e.target.files?.[0] ?? null)} />
                                    </div>
                                    <div>
                                        <Button type="submit" disabled={processing}>
                                            Simpan Perubahan
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="organization">
                        <div className="grid gap-4 md:grid-cols-2">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle className="text-base">Penempatan Saat Ini</CardTitle>
                                    <ChangeAssignmentDialog employee={employee} options={options} />
                                </CardHeader>
                                <CardContent>
                                    <InfoRow label="Company" value={employee.current_company?.name} />
                                    <InfoRow label="Unit Organisasi" value={employee.current_org_unit?.name} />
                                    <InfoRow label="Posisi" value={employee.current_position?.name} />
                                    <InfoRow label="Grade" value={employee.current_job_grade?.name} />
                                    <InfoRow label="Lokasi" value={employee.current_location?.name} />
                                    <InfoRow label="Employee Group" value={employee.current_employee_group?.name} />
                                    <InfoRow label="Tipe" value={employee.current_employment_type?.name} />
                                    <InfoRow label="Atasan" value={employee.reports_to?.full_name} />
                                    <InfoRow label="Efektif Sejak" value={employee.current_effective_date} />
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Riwayat Penempatan</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <AssignmentTimeline assignments={employee.assignments ?? []} />
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="audit">
                        <Card>
                            <CardContent className="pt-6">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Waktu</TableHead>
                                            <TableHead>Aksi</TableHead>
                                            <TableHead>Oleh</TableHead>
                                            <TableHead>Perubahan</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {auditLogs.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center text-muted-foreground">
                                                    Belum ada log.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        {auditLogs.map((log) => (
                                            <TableRow key={log.id}>
                                                <TableCell className="whitespace-nowrap text-xs">{log.created_at}</TableCell>
                                                <TableCell className="capitalize">{log.event}</TableCell>
                                                <TableCell>{log.user?.name ?? 'Sistem'}</TableCell>
                                                <TableCell className="max-w-md text-xs text-muted-foreground">
                                                    {log.new_values ? Object.keys(log.new_values).join(', ') : '-'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </AppLayout>
    );
}
