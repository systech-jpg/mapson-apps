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

interface Entry { id: number; ref: string; tanggal: string; waktu: string | null; jenis_tindakan: string | null; pasien: string | null; status: number }

interface Props {
    employeeLinked: boolean;
    period: string;
    periodLabel?: string;
    mapped?: boolean;
    entries?: Entry[];
    cases?: number;
    tier?: number | null;
    tier_label?: string | null;
    fee_per_case?: number;
    total_fee?: number;
}

const rupiah = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');
const d = (v: string) => (v ? v.substring(0, 10) : '-');

export default function AttendCaseMine({ employeeLinked, period, periodLabel, mapped, entries = [], cases = 0, tier_label, fee_per_case = 0, total_fee = 0 }: Props) {
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
                        <p className="text-sm text-muted-foreground">{periodLabel ? `Periode ${periodLabel}` : period} · data tindakan dari Dolibarr.</p>
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
                    <Card><CardContent className="py-10 text-center text-amber-700 dark:text-amber-400">Data karyawan Anda belum dipetakan ke ERP (ERP User ID kosong). Hubungi HR untuk mengisi pemetaan.</CardContent></Card>
                ) : (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Jumlah Case</div><div className="text-2xl font-semibold">{cases.toLocaleString('id-ID')}</div></CardContent></Card>
                            <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Tier</div><div className="text-2xl font-semibold">{tier_label ?? '-'}</div></CardContent></Card>
                            <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Fee per Case</div><div className="text-2xl font-semibold">{fee_per_case > 0 ? rupiah(fee_per_case) : '-'}</div></CardContent></Card>
                            <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Total Fee</div><div className="text-2xl font-semibold">{total_fee > 0 ? rupiah(total_fee) : '-'}</div></CardContent></Card>
                        </div>

                        <Card>
                            <CardContent className="p-0">
                                <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Tanggal</TableHead>
                                            <TableHead>Ref</TableHead>
                                            <TableHead>Jenis Tindakan</TableHead>
                                            <TableHead>Pasien</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {entries.length === 0 ? (
                                            <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Tidak ada attend case pada periode ini.</TableCell></TableRow>
                                        ) : entries.map((e) => (
                                            <TableRow key={e.id}>
                                                <TableCell className="whitespace-nowrap">{d(e.tanggal)} {e.waktu ? <span className="text-xs text-muted-foreground">{e.waktu.substring(0, 5)}</span> : ''}</TableCell>
                                                <TableCell className="font-mono text-xs">{e.ref}</TableCell>
                                                <TableCell>{e.jenis_tindakan ?? '-'}</TableCell>
                                                <TableCell>{e.pasien ?? '-'}</TableCell>
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
