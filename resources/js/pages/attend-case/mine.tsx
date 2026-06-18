import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Attend Case', href: '#' },
    { title: 'Attend Case Saya', href: '/attend-case' },
];

interface Entry { id: number; ref: string; tanggal: string; waktu: string | null; jenis_tindakan: string | null; pasien: string | null; is_holiday: boolean; fee: number }

interface Props {
    employeeLinked: boolean;
    period: string;
    periodLabel?: string;
    mapped?: boolean;
    entries?: Entry[];
    cases?: number;
    workday_cases?: number;
    holiday_cases?: number;
    tier?: number | null;
    tier_label?: string | null;
    basis?: 'tindakan' | 'invoice' | null;
    fee_workday?: number;
    fee_holiday?: number;
    fee_computed?: boolean;
    total_fee?: number;
}

const rupiah = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');
const d = (v: string) => (v ? v.substring(0, 10) : '-');

export default function AttendCaseMine(props: Props) {
    const { employeeLinked, period, periodLabel, mapped, entries = [], cases = 0, workday_cases = 0, holiday_cases = 0,
        tier_label, basis, fee_workday = 0, fee_holiday = 0, fee_computed = false, total_fee = 0 } = props;

    const shiftPeriod = (delta: number) => {
        const [y, m] = period.split('-').map(Number);
        const dt = new Date(y, m - 1 + delta, 1);
        const np = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        router.get(route('attend-case.mine'), { period: np }, { preserveScroll: true, preserveState: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Attend Case Saya" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">Attend Case Saya</h1>
                        <p className="text-sm text-muted-foreground">{periodLabel ? `Periode ${periodLabel}` : period} · data tindakan dari ERP.</p>
                    </div>
                    <div className="flex items-center rounded-md border">
                        <Button variant="ghost" size="icon" className="size-8 rounded-r-none" onClick={() => shiftPeriod(-1)}><ChevronLeft className="size-4" /></Button>
                        <span className="px-2 text-sm font-medium">{period}</span>
                        <Button variant="ghost" size="icon" className="size-8 rounded-l-none" onClick={() => shiftPeriod(1)}><ChevronRight className="size-4" /></Button>
                    </div>
                </div>

                {!employeeLinked ? (
                    <Card><CardContent className="py-10 text-center text-muted-foreground">Akun Anda belum tertaut ke data karyawan. Hubungi HR.</CardContent></Card>
                ) : !mapped ? (
                    <Card><CardContent className="py-10 text-center text-amber-700 dark:text-amber-400">Data karyawan Anda belum dipetakan ke ERP (ERP User ID kosong). Hubungi HR.</CardContent></Card>
                ) : (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Total Case</div><div className="text-2xl font-semibold">{cases.toLocaleString('id-ID')}</div></CardContent></Card>
                            <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Hari Kerja / Tgl Merah</div><div className="text-2xl font-semibold">{workday_cases} / <span className="text-rose-600">{holiday_cases}</span></div></CardContent></Card>
                            <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Tier</div><div className="text-lg font-semibold">{tier_label ?? '-'}</div>{basis && <div className="text-[10px] text-muted-foreground">{basis === 'invoice' ? 'per invoice' : 'per tindakan'}</div>}</CardContent></Card>
                            <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Fee/Case (Kerja · Merah)</div><div className="text-sm font-semibold">{rupiah(fee_workday)} · <span className="text-rose-600">{rupiah(fee_holiday)}</span></div></CardContent></Card>
                            <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Total Fee</div><div className="text-2xl font-semibold">{fee_computed ? rupiah(total_fee) : '-'}</div></CardContent></Card>
                        </div>

                        {basis === 'invoice' && (
                            <Card><CardContent className="py-3 text-sm text-amber-700 dark:text-amber-400">Tier Anda berbasis <b>invoice</b> — fee dihitung terpisah dari invoice yang sudah dibayar (menyusul), bukan per tindakan.</CardContent></Card>
                        )}

                        <Card>
                            <CardContent className="p-0">
                                <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Tanggal</TableHead>
                                            <TableHead>Ref</TableHead>
                                            <TableHead>Jenis Tindakan</TableHead>
                                            <TableHead>Pasien</TableHead>
                                            <TableHead className="text-right">Fee</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {entries.length === 0 ? (
                                            <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Tidak ada attend case pada periode ini.</TableCell></TableRow>
                                        ) : entries.map((e) => (
                                            <TableRow key={e.id}>
                                                <TableCell className="whitespace-nowrap">
                                                    {d(e.tanggal)} {e.waktu ? <span className="text-xs text-muted-foreground">{e.waktu.substring(0, 5)}</span> : ''}
                                                    {e.is_holiday && <Badge variant="outline" className="ml-1 border-rose-300 text-[10px] text-rose-600">merah</Badge>}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">{e.ref}</TableCell>
                                                <TableCell>{e.jenis_tindakan ?? '-'}</TableCell>
                                                <TableCell>{e.pasien ?? '-'}</TableCell>
                                                <TableCell className="text-right font-mono">{fee_computed ? rupiah(e.fee) : '-'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </AppLayout>
    );
}
