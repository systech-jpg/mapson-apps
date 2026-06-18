import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Attend Case', href: '#' },
    { title: 'Rekap Attend Case', href: '/attend-case-admin' },
    { title: 'Breakdown', href: '#' },
];

interface Entry { id: number; ref: string; tanggal: string; waktu: string | null; jenis_tindakan: string | null; pasien: string | null; is_holiday: boolean; fee: number }

interface Props {
    period: string;
    periodLabel: string;
    erp_user_id: number;
    name: string;
    matched: boolean;
    tier_label: string | null;
    basis: 'tindakan' | 'invoice' | null;
    fee_workday: number;
    fee_holiday: number;
    fee_computed: boolean;
    entries: Entry[];
    cases: number;
    workday_cases: number;
    holiday_cases: number;
    total_fee: number;
}

const rupiah = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');
const d = (v: string) => (v ? v.substring(0, 10) : '-');

export default function AttendCaseBreakdown(p: Props) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Breakdown — ${p.name}`} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">{p.name}</h1>
                        <p className="text-sm text-muted-foreground">
                            Breakdown attend case · periode {p.periodLabel}
                            {p.tier_label && <> · <Badge variant="secondary">{p.tier_label}</Badge> {p.basis === 'invoice' ? '(per invoice)' : '(per tindakan)'}</>}
                            {!p.matched && <span className="text-amber-600"> · belum terpetakan (ERP #{p.erp_user_id})</span>}
                        </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <Link href={route('attend-case.admin', { period: p.period })}><ArrowLeft className="size-4" /> Kembali ke Rekap</Link>
                    </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Total Case</div><div className="text-2xl font-semibold">{p.cases}</div></CardContent></Card>
                    <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Hari Kerja / Tgl Merah</div><div className="text-2xl font-semibold">{p.workday_cases} / <span className="text-rose-600">{p.holiday_cases}</span></div></CardContent></Card>
                    <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Fee/Case (Kerja · Merah)</div><div className="text-sm font-semibold">{rupiah(p.fee_workday)} · <span className="text-rose-600">{rupiah(p.fee_holiday)}</span></div></CardContent></Card>
                    <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Total Fee</div><div className="text-2xl font-semibold">{p.fee_computed ? rupiah(p.total_fee) : '-'}</div></CardContent></Card>
                </div>

                {p.basis === 'invoice' && (
                    <Card><CardContent className="py-3 text-sm text-amber-700 dark:text-amber-400">Tier ini berbasis <b>invoice</b> — fee dihitung terpisah (menyusul), bukan per tindakan.</CardContent></Card>
                )}

                <Card>
                    <CardContent className="p-0">
                        <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10">#</TableHead>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead>Ref</TableHead>
                                    <TableHead>Jenis Tindakan</TableHead>
                                    <TableHead>Pasien</TableHead>
                                    <TableHead className="text-right">Fee</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {p.entries.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Tidak ada attend case pada periode ini.</TableCell></TableRow>
                                ) : p.entries.map((e, i) => (
                                    <TableRow key={e.id} className={e.is_holiday ? 'bg-rose-50/40' : ''}>
                                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {d(e.tanggal)} {e.waktu ? <span className="text-xs text-muted-foreground">{e.waktu.substring(0, 5)}</span> : ''}
                                            {e.is_holiday && <Badge variant="outline" className="ml-1 border-rose-300 text-[10px] text-rose-600">merah</Badge>}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{e.ref}</TableCell>
                                        <TableCell>{e.jenis_tindakan ?? '-'}</TableCell>
                                        <TableCell>{e.pasien ?? '-'}</TableCell>
                                        <TableCell className="text-right font-mono">{p.fee_computed ? rupiah(e.fee) : '-'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
