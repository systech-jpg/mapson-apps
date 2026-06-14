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
    { title: 'Rekap Attend Case', href: '/attend-case-admin' },
];

interface Row {
    erp_user_id: number;
    employee_id: number | null;
    name: string;
    position: string | null;
    matched: boolean;
    tier: number | null;
    tier_label: string | null;
    cases: number;
    fee_per_case: number;
    total_fee: number;
}

interface Props {
    period: string;
    periodLabel: string;
    rows: Row[];
    totals: { cases: number; fee: number; attenders: number; unmapped: number };
}

const rupiah = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID');

export default function AttendCaseAdmin({ period, periodLabel, rows, totals }: Props) {
    const shiftPeriod = (delta: number) => {
        const [y, m] = period.split('-').map(Number);
        const dt = new Date(y, m - 1 + delta, 1);
        const np = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        router.get(route('attend-case.admin'), { period: np }, { preserveScroll: true, preserveState: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Rekap Attend Case" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">Rekap Attend Case</h1>
                        <p className="text-sm text-muted-foreground">Periode {periodLabel} · data tindakan dari Dolibarr (ERP).</p>
                    </div>
                    <div className="flex items-center rounded-md border">
                        <Button variant="ghost" size="icon" className="size-8 rounded-r-none" onClick={() => shiftPeriod(-1)}><ChevronLeft className="size-4" /></Button>
                        <span className="px-2 text-sm font-medium">{period}</span>
                        <Button variant="ghost" size="icon" className="size-8 rounded-l-none" onClick={() => shiftPeriod(1)}><ChevronRight className="size-4" /></Button>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Total Case</div><div className="text-2xl font-semibold">{totals.cases.toLocaleString('id-ID')}</div></CardContent></Card>
                    <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Total Fee</div><div className="text-2xl font-semibold">{rupiah(totals.fee)}</div></CardContent></Card>
                    <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Jumlah Attender</div><div className="text-2xl font-semibold">{totals.attenders}</div></CardContent></Card>
                    <Card><CardContent className="py-4"><div className="text-xs text-muted-foreground">Belum Terpetakan</div><div className={`text-2xl font-semibold ${totals.unmapped > 0 ? 'text-amber-600' : ''}`}>{totals.unmapped}</div></CardContent></Card>
                </div>

                {totals.unmapped > 0 && (
                    <Card>
                        <CardContent className="py-3 text-sm text-amber-700 dark:text-amber-400">
                            {totals.unmapped} attender belum terpetakan ke master Employee. Isi <b>ERP User ID</b> & <b>Tier Attend Case</b> di data karyawan agar fee terhitung.
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardContent className="p-0">
                        <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10">#</TableHead>
                                    <TableHead>Nama</TableHead>
                                    <TableHead>Tier</TableHead>
                                    <TableHead className="text-right">Case</TableHead>
                                    <TableHead className="text-right">Fee/Case</TableHead>
                                    <TableHead className="text-right">Total Fee</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Tidak ada attend case pada periode ini.</TableCell></TableRow>
                                ) : rows.map((r, i) => (
                                    <TableRow key={r.erp_user_id}>
                                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                                        <TableCell>
                                            <div className="font-medium">{r.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {r.position ?? (r.matched ? '—' : <span className="text-amber-600">belum terpetakan (ERP #{r.erp_user_id})</span>)}
                                            </div>
                                        </TableCell>
                                        <TableCell>{r.tier_label ? <Badge variant="secondary">{r.tier_label}</Badge> : <span className="text-xs text-amber-600">tier kosong</span>}</TableCell>
                                        <TableCell className="text-right font-medium">{r.cases.toLocaleString('id-ID')}</TableCell>
                                        <TableCell className="text-right">{r.fee_per_case > 0 ? rupiah(r.fee_per_case) : '-'}</TableCell>
                                        <TableCell className="text-right font-semibold">{r.total_fee > 0 ? rupiah(r.total_fee) : '-'}</TableCell>
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
