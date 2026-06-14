import { LeaveStatusBadge } from '@/components/leave-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Link } from '@inertiajs/react';
import { CalendarPlus, ClipboardList, Inbox, Timer } from 'lucide-react';

interface Balance { code: string | null; name: string | null; allotted: number; used: number; pending: number; available: number }
interface LeaveRow { id: number; request_number: string; type: string | null; start_date: string; end_date: string; total_days: string | number; status: string }
interface OtRow { id: number; request_number: string; period: string; status: string; total_hours: string | number; total_amount: string | number }

export interface GeneralBodyProps {
    year: number;
    annual?: { taken: number; remaining: number; allotted: number } | null;
    balances?: Balance[];
    recentLeave?: LeaveRow[];
    recentOvertime?: OtRow[];
    pendingMine?: { leave: number; overtime: number };
    approvals?: { leave: number; overtime: number };
}

const d = (v: string | null) => (v ? v.substring(0, 10) : '-');
const rupiah = (n: number | string) => 'Rp ' + Number(n).toLocaleString('id-ID');
const num = (n: number | string) => Number(n).toLocaleString('id-ID');

export default function GeneralBody({ year, annual, balances = [], recentLeave = [], recentOvertime = [], pendingMine, approvals }: GeneralBodyProps) {
    const hasApprovals = (approvals?.leave ?? 0) + (approvals?.overtime ?? 0) > 0;

    return (
        <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label={`Sisa Cuti Tahunan ${year}`} value={annual ? `${num(annual.remaining)} hari` : '-'} hint={annual ? `dari ${num(annual.allotted)} hari` : 'belum ada saldo'} />
                <Kpi label="Cuti Terpakai" value={annual ? `${num(annual.taken)} hari` : '-'} hint={`tahun ${year}`} />
                <Kpi label="Pengajuan Cuti Menunggu" value={`${pendingMine?.leave ?? 0}`} hint="status menunggu" />
                <Kpi label="Lembur Diajukan" value={`${pendingMine?.overtime ?? 0}`} hint="periode menunggu" />
            </div>

            <div className="flex flex-wrap gap-2">
                <Button asChild><Link href={route('leave.index')}><CalendarPlus className="size-4" /> Ajukan Cuti</Link></Button>
                <Button variant="outline" asChild><Link href={route('overtime.index')}><Timer className="size-4" /> Input Lembur</Link></Button>
            </div>

            {hasApprovals && (
                <Card>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                        <div className="flex items-center gap-2 text-sm">
                            <Inbox className="size-4 text-amber-600" />
                            <span>Menunggu persetujuan Anda: <b>{approvals?.leave ?? 0}</b> cuti, <b>{approvals?.overtime ?? 0}</b> lembur.</span>
                        </div>
                        <div className="flex gap-2">
                            {(approvals?.leave ?? 0) > 0 && <Button size="sm" variant="outline" asChild><Link href={route('leave.approvals.index')}>Persetujuan Cuti</Link></Button>}
                            {(approvals?.overtime ?? 0) > 0 && <Button size="sm" variant="outline" asChild><Link href={route('overtime.approvals.index')}>Persetujuan Lembur</Link></Button>}
                        </div>
                    </CardContent>
                </Card>
            )}

            {balances.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {balances.map((b) => (
                        <Card key={b.code ?? b.name}>
                            <CardContent className="py-4">
                                <div className="text-xs text-muted-foreground">{b.name}</div>
                                <div className="text-2xl font-semibold">{num(b.available)}</div>
                                <div className="text-xs text-muted-foreground">tersedia · terpakai {num(b.used)}{b.pending > 0 ? ` · pending ${num(b.pending)}` : ''}</div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardContent className="p-0">
                        <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2 font-medium"><ClipboardList className="size-4" /> Pengajuan Cuti Terbaru</div>
                            <Link href={route('leave.index')} className="text-xs text-primary hover:underline">Lihat semua</Link>
                        </div>
                        <Table className="text-sm [&_td]:px-4 [&_td]:py-2 [&_th]:h-8 [&_th]:px-4">
                            <TableHeader>
                                <TableRow><TableHead>Jenis</TableHead><TableHead>Tanggal</TableHead><TableHead className="text-right">Hari</TableHead><TableHead>Status</TableHead></TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentLeave.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Belum ada pengajuan cuti.</TableCell></TableRow>
                                ) : recentLeave.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell>{r.type ?? '-'}</TableCell>
                                        <TableCell className="whitespace-nowrap">{d(r.start_date)} – {d(r.end_date)}</TableCell>
                                        <TableCell className="text-right">{num(r.total_days)}</TableCell>
                                        <TableCell><LeaveStatusBadge status={r.status} /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-0">
                        <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2 font-medium"><Timer className="size-4" /> Lembur Terbaru</div>
                            <Link href={route('overtime.index')} className="text-xs text-primary hover:underline">Lihat semua</Link>
                        </div>
                        <Table className="text-sm [&_td]:px-4 [&_td]:py-2 [&_th]:h-8 [&_th]:px-4">
                            <TableHeader>
                                <TableRow><TableHead>Periode</TableHead><TableHead className="text-right">Jam</TableHead><TableHead className="text-right">Nominal</TableHead><TableHead>Status</TableHead></TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentOvertime.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Belum ada lembur.</TableCell></TableRow>
                                ) : recentOvertime.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell className="whitespace-nowrap">{r.period}</TableCell>
                                        <TableCell className="text-right">{num(r.total_hours)}</TableCell>
                                        <TableCell className="text-right">{rupiah(r.total_amount)}</TableCell>
                                        <TableCell><LeaveStatusBadge status={r.status} /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <Card>
            <CardContent className="py-4">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-2xl font-semibold">{value}</div>
                <div className="text-xs text-muted-foreground">{hint}</div>
            </CardContent>
        </Card>
    );
}
