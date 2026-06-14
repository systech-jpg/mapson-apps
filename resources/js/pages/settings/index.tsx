import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { CalendarCheck, CalendarDays, Clock, Timer } from 'lucide-react';
import AttendanceSection from './partials/attendance-section';
import HolidaysSection from './partials/holidays-section';
import LeaveTypesSection from './partials/leave-types-section';
import OvertimeSection from './partials/overtime-section';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Pengaturan Kepegawaian', href: '/hr-settings' },
];

const NAV_ITEM =
    'w-full justify-start gap-2 rounded-md px-3 py-2 text-sm font-normal text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-muted data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:shadow-none';

function NavGroup({ label }: { label: string }) {
    return <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase first:pt-1">{label}</p>;
}

interface LeaveType {
    id: number; code: string; name: string; unit: string; is_paid: boolean; requires_balance: boolean;
    requires_attachment: boolean; allow_half_day: boolean; gender_constraint: string; default_quota: string | number;
    accrual_method: string; min_notice_days: number; max_consecutive_days: number | null; carry_over_max: string | number;
    carry_over_expire_month: number | null; color: string | null; is_active: boolean;
}

interface Holiday { id: number; date: string; name: string; type: string; is_workday_override: boolean }

interface Props {
    attendance: { deadline: string; full_day_after: string };
    overtime: { rate_per_hour: number; multiplier_workday: number; multiplier_holiday: number };
    leaveTypes: LeaveType[];
    holidayYear: number;
    holidays: Holiday[];
}

export default function HrSettings({ attendance, overtime, leaveTypes, holidayYear, holidays }: Props) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Pengaturan Kepegawaian" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">Pengaturan Kepegawaian</h1>
                    <p className="text-sm text-muted-foreground">Parameter absensi, lembur, dan cuti dalam satu tempat.</p>
                </div>

                <Tabs defaultValue="attendance" orientation="vertical" className="flex flex-col gap-4 lg:flex-row lg:items-start">
                    <Card className="w-full shrink-0 lg:sticky lg:top-4 lg:w-64">
                        <CardContent className="p-2">
                            <TabsList className="flex h-auto w-full flex-col items-stretch gap-0.5 bg-transparent p-0">
                                <NavGroup label="Absen & Lembur" />
                                <TabsTrigger className={NAV_ITEM} value="attendance"><Clock className="size-4" /> Absensi</TabsTrigger>
                                <TabsTrigger className={NAV_ITEM} value="overtime"><Timer className="size-4" /> Lembur</TabsTrigger>
                                <NavGroup label="Cuti" />
                                <TabsTrigger className={NAV_ITEM} value="types"><CalendarDays className="size-4" /> Jenis Cuti</TabsTrigger>
                                <TabsTrigger className={NAV_ITEM} value="holidays"><CalendarCheck className="size-4" /> Hari Libur</TabsTrigger>
                            </TabsList>
                        </CardContent>
                    </Card>

                    <div className="min-w-0 flex-1 [&>[role=tabpanel]]:mt-0">
                        <TabsContent value="attendance"><AttendanceSection attendance={attendance} /></TabsContent>
                        <TabsContent value="overtime"><OvertimeSection overtime={overtime} /></TabsContent>
                        <TabsContent value="types"><LeaveTypesSection types={leaveTypes} /></TabsContent>
                        <TabsContent value="holidays"><HolidaysSection year={holidayYear} holidays={holidays} /></TabsContent>
                    </div>
                </Tabs>
            </div>
        </AppLayout>
    );
}
