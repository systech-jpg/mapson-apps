import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { LayoutGrid } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

type Status = 'match' | 'diff' | 'acc_only' | 'dol_only';
interface Row { vendor: string; tahun: string; cur: string; acc: number; acc_docs: number; dol: number; dol_docs: number; selisih: number; status: Status }
interface Props {
    rows: Row[];
    years: string[];
    summary: { match: number; diff: number; acc_only: number; dol_only: number };
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integrasi Data', href: '#' },
    { title: 'Monitoring Pembelian', href: '/integration/purchase-monitor' },
    { title: 'Rekonsiliasi', href: '/integration/purchase-monitor/reconciliation' },
];

const num = (n: number, d = 0) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: d });

const STATUS: Record<Status, { label: string; cls: string }> = {
    match: { label: 'Cocok', cls: 'border-emerald-400 text-emerald-600 dark:text-emerald-400' },
    diff: { label: 'Selisih', cls: 'border-amber-400 text-amber-600 dark:text-amber-400' },
    acc_only: { label: 'Hanya Accurate', cls: 'border-sky-400 text-sky-600 dark:text-sky-400' },
    dol_only: { label: 'Hanya Dolibarr', cls: 'border-violet-400 text-violet-600 dark:text-violet-400' },
};

export default function PurchaseReconciliation({ rows, years, summary }: Props) {
    const [q, setQ] = useState('');
    const [year, setYear] = useState<string | null>(null);
    const [status, setStatus] = useState<Status | null>(null);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        return rows.filter((r) => (!year || r.tahun === year) && (!status || r.status === status) && (!s || r.vendor.toLowerCase().includes(s)));
    }, [rows, q, year, status]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Rekonsiliasi Pembelian" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold">Rekonsiliasi Pembelian — Accurate vs Dolibarr</h1>
                        <p className="text-sm text-muted-foreground">
                            Dicocokkan per <b>vendor × tahun × mata uang</b> (kedua sistem tak berbagi nomor dokumen), membandingkan <b>nilai asli</b> mata uang.
                            Sisi Dolibarr memakai <b>PO</b> berstatus ordered / partial / full receive — faktur pembelian tidak dibuat di Dolibarr karena pembayaran dicatat di Accurate.
                        </p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1.5">
                        <Link href={route('purchase-monitor.index')}><LayoutGrid className="size-3.5" /> Dashboard</Link>
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label="Cocok" value={summary.match} active={status === 'match'} onClick={() => setStatus(status === 'match' ? null : 'match')} tone="match" />
                    <StatCard label="Selisih Nilai" value={summary.diff} active={status === 'diff'} onClick={() => setStatus(status === 'diff' ? null : 'diff')} tone="diff" />
                    <StatCard label="Hanya di Accurate" value={summary.acc_only} active={status === 'acc_only'} onClick={() => setStatus(status === 'acc_only' ? null : 'acc_only')} tone="acc_only" />
                    <StatCard label="Hanya di Dolibarr" value={summary.dol_only} active={status === 'dol_only'} onClick={() => setStatus(status === 'dol_only' ? null : 'dol_only')} tone="dol_only" />
                </div>

                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <CardTitle className="text-base">Detail Rekonsiliasi</CardTitle>
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    <Seg active={!year} onClick={() => setYear(null)}>Semua</Seg>
                                    {years.map((y) => <Seg key={y} active={year === y} onClick={() => setYear(y)}>{y}</Seg>)}
                                </div>
                                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari vendor…" className="h-8 w-48" />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {filtered.length} baris{status && ` · filter: ${STATUS[status].label}`}. Nilai dalam mata uang asli tiap baris.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table className="text-sm [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Vendor</TableHead>
                                        <TableHead>Tahun</TableHead>
                                        <TableHead>Mata Uang</TableHead>
                                        <TableHead className="text-right">Accurate</TableHead>
                                        <TableHead className="text-right">Dolibarr (PO)</TableHead>
                                        <TableHead className="text-right">Selisih</TableHead>
                                        <TableHead className="text-center">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filtered.map((r, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="font-medium">{r.vendor}</TableCell>
                                            <TableCell className="text-muted-foreground">{r.tahun}</TableCell>
                                            <TableCell>{r.cur}</TableCell>
                                            <TableCell className="text-right tabular-nums whitespace-nowrap">
                                                {r.acc ? num(r.acc, 2) : <span className="text-muted-foreground/40">–</span>}
                                                {r.acc_docs > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({r.acc_docs})</span>}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums whitespace-nowrap">
                                                {r.dol ? num(r.dol, 2) : <span className="text-muted-foreground/40">–</span>}
                                                {r.dol_docs > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({r.dol_docs})</span>}
                                            </TableCell>
                                            <TableCell className={`text-right tabular-nums whitespace-nowrap ${Math.abs(r.selisih) >= 1 ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                                {num(r.selisih, 2)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="outline" className={`text-[10px] ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}

function StatCard({ label, value, active, onClick, tone }: { label: string; value: number; active: boolean; onClick: () => void; tone: Status }) {
    return (
        <button onClick={onClick} className={`rounded-lg border p-3.5 text-left transition-colors ${active ? 'ring-2 ring-primary' : 'hover:bg-accent'}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${STATUS[tone].cls.split(' ').filter((c) => c.startsWith('text')).join(' ')}`}>{value}</p>
        </button>
    );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" onClick={onClick}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
            {children}
        </button>
    );
}
