import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type AuditLog, type BreadcrumbItem, type Employee, type Lookup } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { FileSignature, FolderArchive, GraduationCap, History, Landmark, MapPin, Network, ScrollText, User, Users } from 'lucide-react';
import { type FormEventHandler } from 'react';
import AssignmentTimeline from './partials/assignment-timeline';
import ChangeAssignmentDialog from './partials/change-assignment-dialog';
import { type AssignmentOptions } from './partials/assignment-fields';
import ContractsTab, { type EmployeeContractRow } from './partials/contracts-tab';
import DocumentsTab, { type EmployeeDocumentRow } from './partials/documents-tab';
import PersonalFields from './partials/personal-fields';
import RecordsTab from './partials/records-tab';

type Rec = Array<Record<string, unknown> & { id: number }>;

const CONTACT_TYPES = [
    { v: 'mobile', l: 'HP' },
    { v: 'phone', l: 'Telepon' },
    { v: 'whatsapp', l: 'WhatsApp' },
    { v: 'email', l: 'Email' },
];
const ADDRESS_TYPES = [
    { v: 'ktp', l: 'Sesuai KTP' },
    { v: 'domicile', l: 'Domisili' },
    { v: 'other', l: 'Lainnya' },
];
const EDUCATION_LEVELS = ['sd', 'smp', 'sma', 'smk', 'd1', 'd2', 'd3', 'd4', 's1', 's2', 's3', 'other'].map((v) => ({ v, l: v.toUpperCase() }));
const FAMILY_RELATIONSHIPS = [
    { v: 'spouse', l: 'Pasangan (Suami/Istri)' },
    { v: 'child', l: 'Anak' },
    { v: 'parent', l: 'Orang Tua' },
    { v: 'sibling', l: 'Saudara' },
    { v: 'other', l: 'Lainnya' },
];
const FAMILY_REL_LABEL: Record<string, string> = { spouse: 'Pasangan', child: 'Anak', parent: 'Orang Tua', sibling: 'Saudara', other: 'Lainnya' };
const TRAINING_TYPES = [
    { v: 'training', l: 'Training' },
    { v: 'certification', l: 'Sertifikasi' },
];

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

function HeaderStat({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex min-w-0 items-baseline justify-between gap-3 border-b py-1 text-xs last:border-0 sm:border-0 sm:py-0.5">
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <span className="truncate text-right font-medium" title={value ?? ''}>{value || '-'}</span>
        </div>
    );
}

const NAV_ITEM =
    'w-full justify-start gap-2 rounded-md px-3 py-2 text-sm font-normal text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-muted data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:shadow-none';

function NavGroup({ label }: { label: string }) {
    return <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase first:pt-1">{label}</p>;
}

function tenure(from?: string | null): string | null {
    if (!from) return null;
    const start = new Date(from);
    if (isNaN(start.getTime())) return null;
    let months = (Date.now() - start.getTime()) / (30.44 * 86_400_000);
    if (months < 0) months = 0;
    const y = Math.floor(months / 12);
    const m = Math.floor(months % 12);
    return y > 0 ? `${y} thn ${m} bln` : `${m} bln`;
}

export default function ShowEmployee({ employee, linkableUsers, ...options }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Human Resources', href: route('employees.index') },
        { title: 'Karyawan', href: route('employees.index') },
        { title: employee.full_name ?? employee.employee_code ?? 'Detail', href: route('employees.show', employee.id) },
    ];

    const { data, setData, post, processing, errors } = useForm<Record<string, string | boolean | File | null>>({
        _method: 'put',
        employee_code: employee.employee_code ?? '',
        first_name: employee.first_name ?? '',
        last_name: employee.last_name ?? '',
        nik_ktp: employee.nik_ktp ?? '',
        kk_number: employee.kk_number ?? '',
        npwp: employee.npwp ?? '',
        gender: employee.gender ?? '',
        birth_place: employee.birth_place ?? '',
        birth_date: employee.birth_date ? employee.birth_date.substring(0, 10) : '',
        religion: employee.religion ?? '',
        marital_status: employee.marital_status ?? '',
        ptkp_status: employee.ptkp_status ?? '',
        nationality: employee.nationality ?? 'WNI',
        blood_type: employee.blood_type ?? '',
        bpjs_kesehatan_no: employee.bpjs_kesehatan_no ?? '',
        bpjs_kesehatan_notes: employee.bpjs_kesehatan_notes ?? '',
        bpjs_ketenagakerjaan_no: employee.bpjs_ketenagakerjaan_no ?? '',
        bpjs_ketenagakerjaan_notes: employee.bpjs_ketenagakerjaan_notes ?? '',
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
                {/* Full-width profile header (always visible) */}
                <Card>
                    <CardContent className="flex flex-col gap-4 py-4 md:flex-row md:items-center lg:gap-4">
                        <div className="flex items-center gap-3 md:w-[232px] md:shrink-0">
                            <Avatar className="size-16 border">
                                {employee.photo_path && <AvatarImage src={route('employees.photo', employee.id)} alt={employee.full_name ?? ''} />}
                                <AvatarFallback className="text-lg">{(employee.full_name ?? '?').substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                                <h1 className="truncate text-lg font-semibold">{employee.full_name}</h1>
                                <p className="truncate text-sm text-muted-foreground">{employee.current_position?.name ?? 'Tanpa posisi'}</p>
                                <div className="mt-1 flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">{employee.employee_code}</span>
                                    <Badge variant={employee.current_employment_status === 'active' ? 'default' : 'secondary'} className="capitalize">
                                        {employee.current_employment_status}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                        <div className="grid flex-1 gap-x-12 gap-y-1.5 sm:grid-cols-2 md:border-l md:pl-6 lg:grid-cols-3">
                            <HeaderStat label="Company" value={employee.current_company?.name} />
                            <HeaderStat label="Unit" value={employee.current_org_unit?.name} />
                            <HeaderStat label="Tipe" value={employee.current_employment_type?.name} />
                            <HeaderStat label="Atasan" value={employee.reports_to?.full_name} />
                            <HeaderStat label="Bergabung" value={employee.hire_date ? employee.hire_date.substring(0, 10) : null} />
                            <HeaderStat label="Masa Kerja" value={tenure(employee.hire_date)} />
                            <HeaderStat label="NIK" value={employee.nik_ktp} />
                            <HeaderStat label="NPWP" value={employee.npwp} />
                        </div>
                    </CardContent>
                </Card>

                {/* Body: section nav (left) + content (right) */}
                <Tabs defaultValue="personal" orientation="vertical" className="flex flex-col gap-4 lg:flex-row lg:items-start">
                    <Card className="w-full shrink-0 lg:sticky lg:top-4 lg:w-64">
                        <CardContent className="p-2">
                            <TabsList className="flex h-auto w-full flex-col items-stretch gap-0.5 bg-transparent p-0">
                                <NavGroup label="Profil" />
                                <TabsTrigger className={NAV_ITEM} value="personal"><User className="size-4" /> Data Pribadi</TabsTrigger>
                                <TabsTrigger className={NAV_ITEM} value="contact"><MapPin className="size-4" /> Kontak & Alamat</TabsTrigger>
                                <TabsTrigger className={NAV_ITEM} value="family"><Users className="size-4" /> Keluarga</TabsTrigger>
                                <NavGroup label="Kepegawaian" />
                                <TabsTrigger className={NAV_ITEM} value="organization"><Network className="size-4" /> Organisasi</TabsTrigger>
                                <TabsTrigger className={NAV_ITEM} value="contracts"><FileSignature className="size-4" /> Kontrak</TabsTrigger>
                                <TabsTrigger className={NAV_ITEM} value="education"><GraduationCap className="size-4" /> Pendidikan & Karier</TabsTrigger>
                                <NavGroup label="Keuangan & Berkas" />
                                <TabsTrigger className={NAV_ITEM} value="bank"><Landmark className="size-4" /> Bank</TabsTrigger>
                                <TabsTrigger className={NAV_ITEM} value="documents"><FolderArchive className="size-4" /> Dokumen</TabsTrigger>
                                <NavGroup label="Sistem" />
                                <TabsTrigger className={NAV_ITEM} value="audit"><ScrollText className="size-4" /> Audit Log</TabsTrigger>
                            </TabsList>
                        </CardContent>
                    </Card>

                    {/* Section content */}
                    <div className="min-w-0 flex-1 [&>[role=tabpanel]]:mt-0">

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
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-base">Penempatan Saat Ini</CardTitle>
                                <div className="flex items-center gap-2">
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="sm">
                                                <History className="size-4" /> Riwayat
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                                            <DialogHeader>
                                                <DialogTitle>Riwayat Penempatan</DialogTitle>
                                            </DialogHeader>
                                            <AssignmentTimeline assignments={employee.assignments ?? []} />
                                        </DialogContent>
                                    </Dialog>
                                    <ChangeAssignmentDialog employee={employee} options={options} />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid gap-x-12 md:grid-cols-2">
                                    <div>
                                        <InfoRow label="Company" value={employee.current_company?.name} />
                                        <InfoRow label="Unit Organisasi" value={employee.current_org_unit?.name} />
                                        <InfoRow label="Posisi" value={employee.current_position?.name} />
                                        <InfoRow label="Grade" value={employee.current_job_grade?.name} />
                                        <InfoRow label="Lokasi" value={employee.current_location?.name} />
                                    </div>
                                    <div>
                                        <InfoRow label="Employee Group" value={employee.current_employee_group?.name} />
                                        <InfoRow label="Tipe" value={employee.current_employment_type?.name} />
                                        <InfoRow label="Atasan" value={employee.reports_to?.full_name} />
                                        <InfoRow label="Efektif Sejak" value={employee.current_effective_date} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="contact">
                        <div className="grid gap-4">
                            <RecordsTab
                                title="Kontak (Telepon & Email)"
                                addLabel="Tambah Kontak"
                                employeeId={employee.id}
                                type="contacts"
                                records={(employee.contacts ?? []) as Rec}
                                fields={[
                                    { key: 'type', label: 'Jenis', input: 'select', options: CONTACT_TYPES, required: true },
                                    { key: 'value', label: 'Nomor / Alamat Email', required: true, placeholder: 'mis. +62 812... atau nama@gmail.com' },
                                    { key: 'label', label: 'Keterangan', placeholder: 'mis. pribadi / kantor' },
                                    { key: 'is_primary', label: 'Jadikan utama (per jenis)', input: 'switch' },
                                ]}
                                columns={[
                                    { key: 'type', label: 'Jenis', render: (r) => <span className="capitalize">{String(r.type)}</span> },
                                    { key: 'value', label: 'Nomor / Email' },
                                    { key: 'label', label: 'Keterangan' },
                                    { key: 'is_primary', label: 'Utama' },
                                ]}
                            />
                            <RecordsTab
                                title="Alamat"
                                addLabel="Tambah Alamat"
                                employeeId={employee.id}
                                type="addresses"
                                records={(employee.addresses ?? []) as Rec}
                                fields={[
                                    { key: 'type', label: 'Jenis', input: 'select', options: ADDRESS_TYPES, required: true },
                                    { key: 'line1', label: 'Alamat', required: true, wide: true, placeholder: 'Jalan, nomor, kompleks...' },
                                    { key: 'rt', label: 'RT' },
                                    { key: 'rw', label: 'RW' },
                                    { key: 'kelurahan', label: 'Kelurahan' },
                                    { key: 'kecamatan', label: 'Kecamatan' },
                                    { key: 'city', label: 'Kota/Kabupaten' },
                                    { key: 'province', label: 'Provinsi' },
                                    { key: 'postal_code', label: 'Kode Pos' },
                                    { key: 'is_primary', label: 'Jadikan alamat utama', input: 'switch' },
                                ]}
                                columns={[
                                    { key: 'type', label: 'Jenis', render: (r) => <span className="uppercase">{String(r.type)}</span> },
                                    { key: 'line1', label: 'Alamat' },
                                    { key: 'city', label: 'Kota' },
                                    { key: 'province', label: 'Provinsi' },
                                    { key: 'is_primary', label: 'Utama' },
                                ]}
                            />
                            <RecordsTab
                                title="Kontak Darurat"
                                addLabel="Tambah Kontak Darurat"
                                employeeId={employee.id}
                                type="emergency-contacts"
                                records={(employee.emergency_contacts ?? []) as Rec}
                                fields={[
                                    { key: 'name', label: 'Nama', required: true },
                                    { key: 'relationship', label: 'Hubungan', placeholder: 'mis. Istri / Suami / Ibu' },
                                    { key: 'phone', label: 'No HP', required: true },
                                    { key: 'email', label: 'Email' },
                                    { key: 'address', label: 'Alamat', wide: true },
                                ]}
                                columns={[
                                    { key: 'name', label: 'Nama' },
                                    { key: 'relationship', label: 'Hubungan' },
                                    { key: 'phone', label: 'No HP' },
                                    { key: 'email', label: 'Email' },
                                ]}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="family">
                        <RecordsTab
                            title="Anggota Keluarga"
                            addLabel="Tambah Anggota"
                            employeeId={employee.id}
                            type="families"
                            records={(employee.families ?? []) as Rec}
                            fields={[
                                { key: 'name', label: 'Nama', required: true },
                                { key: 'relationship', label: 'Hubungan', input: 'select', options: FAMILY_RELATIONSHIPS, required: true },
                                { key: 'gender', label: 'Jenis Kelamin', input: 'select', options: [{ v: 'male', l: 'Laki-laki' }, { v: 'female', l: 'Perempuan' }] },
                                { key: 'birth_date', label: 'Tanggal Lahir', input: 'date' },
                                { key: 'nik', label: 'NIK' },
                                { key: 'occupation', label: 'Pekerjaan' },
                                { key: 'is_dependent', label: 'Tanggungan (BPJS/pajak)', input: 'switch' },
                            ]}
                            columns={[
                                { key: 'name', label: 'Nama' },
                                { key: 'relationship', label: 'Hubungan', render: (r) => FAMILY_REL_LABEL[String(r.relationship)] ?? String(r.relationship) },
                                { key: 'birth_date', label: 'Tgl Lahir', render: (r) => (r.birth_date ? String(r.birth_date).substring(0, 10) : '-') },
                                { key: 'nik', label: 'NIK' },
                                { key: 'is_dependent', label: 'Tanggungan' },
                            ]}
                        />
                    </TabsContent>

                    <TabsContent value="education">
                        <div className="grid gap-4">
                        <RecordsTab
                            title="Pendidikan"
                            addLabel="Tambah Pendidikan"
                            employeeId={employee.id}
                            type="educations"
                            records={(employee.educations ?? []) as Rec}
                            fields={[
                                { key: 'level', label: 'Jenjang', input: 'select', options: EDUCATION_LEVELS, required: true },
                                { key: 'institution', label: 'Institusi / Sekolah', required: true },
                                { key: 'major', label: 'Jurusan' },
                                { key: 'start_year', label: 'Tahun Masuk', input: 'number' },
                                { key: 'end_year', label: 'Tahun Lulus', input: 'number' },
                                { key: 'gpa', label: 'IPK', input: 'number' },
                                { key: 'is_highest', label: 'Pendidikan terakhir/tertinggi', input: 'switch' },
                            ]}
                            columns={[
                                { key: 'level', label: 'Jenjang', render: (r) => <span className="uppercase">{String(r.level)}</span> },
                                { key: 'institution', label: 'Institusi' },
                                { key: 'major', label: 'Jurusan' },
                                { key: 'end_year', label: 'Lulus' },
                                { key: 'is_highest', label: 'Terakhir' },
                            ]}
                        />
                        <RecordsTab
                            title="Pengalaman Kerja"
                            addLabel="Tambah Pengalaman"
                            employeeId={employee.id}
                            type="experiences"
                            records={(employee.experiences ?? []) as Rec}
                            fields={[
                                { key: 'company_name', label: 'Perusahaan', required: true },
                                { key: 'position', label: 'Posisi' },
                                { key: 'start_date', label: 'Mulai', input: 'date' },
                                { key: 'end_date', label: 'Selesai', input: 'date' },
                                { key: 'last_salary', label: 'Gaji Terakhir', input: 'number' },
                                { key: 'description', label: 'Deskripsi', wide: true },
                            ]}
                            columns={[
                                { key: 'company_name', label: 'Perusahaan' },
                                { key: 'position', label: 'Posisi' },
                                { key: 'start_date', label: 'Mulai', render: (r) => (r.start_date ? String(r.start_date).substring(0, 10) : '-') },
                                { key: 'end_date', label: 'Selesai', render: (r) => (r.end_date ? String(r.end_date).substring(0, 10) : '-') },
                            ]}
                        />
                        <RecordsTab
                            title="Training & Sertifikasi"
                            addLabel="Tambah"
                            employeeId={employee.id}
                            type="trainings"
                            records={(employee.trainings ?? []) as Rec}
                            fields={[
                                { key: 'type', label: 'Jenis', input: 'select', options: TRAINING_TYPES, required: true },
                                { key: 'name', label: 'Nama Training/Sertifikat', required: true },
                                { key: 'provider', label: 'Penyelenggara' },
                                { key: 'certificate_no', label: 'No Sertifikat' },
                                { key: 'issued_date', label: 'Tanggal Terbit', input: 'date' },
                                { key: 'expiry_date', label: 'Kedaluwarsa', input: 'date' },
                                { key: 'notes', label: 'Catatan', wide: true },
                            ]}
                            columns={[
                                { key: 'type', label: 'Jenis', render: (r) => (String(r.type) === 'certification' ? 'Sertifikasi' : 'Training') },
                                { key: 'name', label: 'Nama' },
                                { key: 'provider', label: 'Penyelenggara' },
                                { key: 'certificate_no', label: 'No Sertifikat' },
                                { key: 'expiry_date', label: 'Kedaluwarsa', render: (r) => (r.expiry_date ? String(r.expiry_date).substring(0, 10) : '-') },
                            ]}
                        />
                        </div>
                    </TabsContent>

                    <TabsContent value="bank">
                        <RecordsTab
                            title="Rekening Bank"
                            addLabel="Tambah Rekening"
                            employeeId={employee.id}
                            type="bank-accounts"
                            records={(employee.bank_accounts ?? []) as Rec}
                            fields={[
                                { key: 'bank_name', label: 'Bank', required: true, placeholder: 'mis. BCA / Mandiri' },
                                { key: 'account_number', label: 'Nomor Rekening', required: true },
                                { key: 'account_holder', label: 'Atas Nama' },
                                { key: 'branch', label: 'Cabang' },
                                { key: 'is_primary', label: 'Jadikan rekening utama (payroll)', input: 'switch' },
                            ]}
                            columns={[
                                { key: 'bank_name', label: 'Bank' },
                                { key: 'account_number', label: 'No Rekening' },
                                { key: 'account_holder', label: 'Atas Nama' },
                                { key: 'is_primary', label: 'Utama' },
                            ]}
                        />
                    </TabsContent>

                    <TabsContent value="contracts">
                        <ContractsTab employeeId={employee.id} contracts={(employee.contracts ?? []) as EmployeeContractRow[]} />
                    </TabsContent>

                    <TabsContent value="documents">
                        <DocumentsTab employeeId={employee.id} documents={(employee.documents ?? []) as EmployeeDocumentRow[]} />
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
                    </div>
                </Tabs>
            </div>
        </AppLayout>
    );
}
