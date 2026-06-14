import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { type ComponentType } from 'react';
import GeneralBody, { type GeneralBodyProps } from './partials/general-body';
import SalesBody from './partials/sales-body';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Beranda', href: '/beranda' }];

// Registry of dashboard variants keyed by the employee group slug. Add new variants
// here; unknown groups fall back to the general self-service body.
const VARIANTS: Record<string, ComponentType<GeneralBodyProps>> = {
    sales: SalesBody,
};

interface Props extends GeneralBodyProps {
    employeeLinked: boolean;
    variant?: string;
    employeeGroup?: string | null;
    profile?: {
        full_name: string; employee_code: string; position: string | null; org_unit: string | null;
        company: string | null; email: string; hire_date: string | null; status: string | null; has_photo: boolean;
    };
}

const d = (v: string | null) => (v ? v.substring(0, 10) : '-');

function tenure(from?: string | null): string {
    if (!from) return '-';
    const start = new Date(from);
    const now = new Date();
    let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (months < 0) months = 0;
    const y = Math.floor(months / 12);
    const m = months % 12;
    return [y > 0 ? `${y} thn` : '', m > 0 ? `${m} bln` : ''].filter(Boolean).join(' ') || '< 1 bln';
}

export default function MyDashboard({ employeeLinked, variant, employeeGroup, profile, ...body }: Props) {
    const Body = (variant && VARIANTS[variant]) || GeneralBody;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Beranda" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                {!employeeLinked ? (
                    <Card>
                        <CardContent className="py-10 text-center text-muted-foreground">
                            Akun Anda belum tertaut ke data karyawan. Hubungi HR untuk menautkan agar data cuti & lembur tampil di sini.
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <Card>
                            <CardContent className="flex flex-col gap-4 py-4 md:flex-row md:items-center">
                                <div className="flex items-center gap-3 md:w-72 md:shrink-0">
                                    <Avatar className="size-16 border">
                                        {profile?.has_photo && <AvatarImage src={route('beranda.photo')} alt={profile?.full_name ?? ''} />}
                                        <AvatarFallback className="text-lg">{(profile?.full_name ?? '?').substring(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <h1 className="truncate text-lg font-semibold">{profile?.full_name}</h1>
                                        <p className="truncate text-sm text-muted-foreground">{profile?.position ?? 'Tanpa posisi'}</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                            <span className="text-xs text-muted-foreground">{profile?.employee_code}</span>
                                            {profile?.status && <Badge variant="secondary" className="capitalize">{profile.status}</Badge>}
                                            {employeeGroup && <Badge variant="outline">{employeeGroup}</Badge>}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid flex-1 gap-x-10 gap-y-1.5 text-sm sm:grid-cols-2 md:border-l md:pl-6 lg:grid-cols-3">
                                    <Stat label="Unit" value={profile?.org_unit} />
                                    <Stat label="Perusahaan" value={profile?.company} />
                                    <Stat label="Email" value={profile?.email} />
                                    <Stat label="Bergabung" value={d(profile?.hire_date ?? null)} />
                                    <Stat label="Masa Kerja" value={tenure(profile?.hire_date)} />
                                </div>
                            </CardContent>
                        </Card>

                        <Body {...body} />
                    </>
                )}
            </div>
        </AppLayout>
    );
}

function Stat({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex flex-col">
            <span className="text-[11px] text-muted-foreground uppercase">{label}</span>
            <span className="truncate">{value || '-'}</span>
        </div>
    );
}
