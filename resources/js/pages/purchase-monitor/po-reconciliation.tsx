import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { GitCompareArrows, LayoutGrid, Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

type Status = 'match' | 'diff' | 'erp_only' | 'acc_only';
interface Row {
    number: string; vendor: string | null; tanggal: string | null; cur: string;
    dol_ttc: number | null; dol_ht: number | null; dol_statut: number | null;
    acc_total: number | null; acc_status: string | null; acc_percent: number | null; acc_cur: string | null;
    selisih: number | null; status: Status;
}
interface Line { label: string; qty: number; price: number; total: number }
interface PoDetail {
    erp: { found: boolean; cur: string | null; total_ht: number | null; total_ttc: number | null; lines: Line[] };
    acc: { found: boolean; cur: string | null; total: number | null; status: string | null; lines: Line[]; error: string | null };
}
interface Props {
    rows: Row[];
    years: string[];
    summary: { match: number; diff: number; erp_only: number; acc_only: number };
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integrasi Data', href: '#' },
    { title: 'Monitoring Pembelian', href: '/integration/purchase-monitor' },
    { title: 'Rekonsiliasi PO', href: '/integration/purchase-monitor/po-reconciliation' },
];

const num = (n: number, d = 0) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: d });

const STATUS: Record<Status, { label: string; cls: string }> = {
    match: { label: 'Cocok', cls: 'border-emerald-400 text-emerald-600 dark:text-emerald-400' },
    diff: { label: 'Selisih', cls: 'border-amber-400 text-amber-600 dark:text-amber-400' },
    erp_only: { label: 'Hanya ERP', cls: 'border-violet-400 text-violet-600 dark:text-violet-400' },
    acc_only: { label: 'Hanya Accurate', cls: 'border-sky-400 text-sky-600 dark:text-sky-400' },
};

const DOL_STATUS: Record<number, string> = { 2: 'Approved', 3: 'Ordered', 4: 'Diterima sebagian', 5: 'Diterima penuh' };

export default function PoReconciliation({ rows, years, summary }: Props) {
    const [q, setQ] = useState('');
    const [year, setYear] = useState<string | null>(null);
    const [status, setStatus] = useState<Status | null>(null);
    const [detailRow, setDetailRow] = useState<Row | null>(null);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        return rows.filter((r) =>
            (!year || (r.tanggal ?? '').startsWith(year)) &&
            (!status || r.status === status) &&
            (!s || r.number.toLowerCase().includes(s) || (r.vendor ?? '').toLowerCase().includes(s)));
    }, [rows, q, year, status]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Rekonsiliasi PO" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold">Rekonsiliasi PO — ERP vs Accurate</h1>
                        <p className="text-sm text-muted-foreground">
                            Satu baris per <b>nomor PO</b> (nomornya sama di kedua sistem), membandingkan <b>nilai total dokumen</b> dalam mata uang aslinya.
                        </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
                            <Link href={route('purchase-monitor.reconciliation')}><GitCompareArrows className="size-3.5" /> Rekon Vendor</Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
                            <Link href={route('purchase-monitor.index')}><LayoutGrid className="size-3.5" /> Dashboard</Link>
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label="Cocok" value={summary.match} active={status === 'match'} onClick={() => setStatus(status === 'match' ? null : 'match')} tone="match" />
                    <StatCard label="Selisih Nilai" value={summary.diff} active={status === 'diff'} onClick={() => setStatus(status === 'diff' ? null : 'diff')} tone="diff" />
                    <StatCard label="Hanya di ERP" value={summary.erp_only} active={status === 'erp_only'} onClick={() => setStatus(status === 'erp_only' ? null : 'erp_only')} tone="erp_only" />
                    <StatCard label="Hanya di Accurate" value={summary.acc_only} active={status === 'acc_only'} onClick={() => setStatus(status === 'acc_only' ? null : 'acc_only')} tone="acc_only" />
                </div>

                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <CardTitle className="text-base">Detail per PO</CardTitle>
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    <Seg active={!year} onClick={() => setYear(null)}>Semua</Seg>
                                    {years.map((y) => <Seg key={y} active={year === y} onClick={() => setYear(y)}>{y}</Seg>)}
                                </div>
                                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari nomor PO / vendor…" className="h-8 w-56" />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {filtered.length} PO{status && ` · filter: ${STATUS[status].label}`}. Nilai = total dokumen (termasuk PPN bila ada) dalam mata uang asli.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table className="text-sm [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nomor PO</TableHead>
                                        <TableHead>Vendor</TableHead>
                                        <TableHead>Tanggal</TableHead>
                                        <TableHead>Mata Uang</TableHead>
                                        <TableHead className="text-right">ERP</TableHead>
                                        <TableHead className="text-right">Accurate</TableHead>
                                        <TableHead className="text-right">Selisih</TableHead>
                                        <TableHead>Proses</TableHead>
                                        <TableHead className="text-center">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filtered.map((r) => (
                                        <TableRow key={r.number} className="cursor-pointer" onClick={() => setDetailRow(r)}>
                                            <TableCell className="font-medium whitespace-nowrap">{r.number}</TableCell>
                                            <TableCell className="max-w-56 truncate" title={r.vendor ?? ''}>{r.vendor}</TableCell>
                                            <TableCell className="whitespace-nowrap text-muted-foreground">{r.tanggal}</TableCell>
                                            <TableCell>
                                                {r.cur}
                                                {r.acc_cur && r.acc_cur !== r.cur && <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">≠ Acc: {r.acc_cur}</span>}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums whitespace-nowrap">
                                                {r.dol_ttc !== null ? num(r.dol_ttc, 2) : <span className="text-muted-foreground/40">–</span>}
                                                {r.dol_statut !== null && <span className="ml-1 text-[10px] text-muted-foreground">({DOL_STATUS[r.dol_statut] ?? r.dol_statut})</span>}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums whitespace-nowrap">
                                                {r.acc_total !== null ? num(r.acc_total, 2) : <span className="text-muted-foreground/40">–</span>}
                                            </TableCell>
                                            <TableCell className={`text-right tabular-nums whitespace-nowrap ${r.selisih !== null && Math.abs(r.selisih) >= 1 ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                                {r.selisih !== null ? num(r.selisih, 2) : '–'}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {r.acc_status
                                                    ? <Badge variant="outline" className={`text-[10px] ${r.acc_status === 'Terproses' ? 'border-emerald-400 text-emerald-600 dark:text-emerald-400' : 'border-amber-400 text-amber-600 dark:text-amber-400'}`}>
                                                        {r.acc_status}{r.acc_percent !== null && r.acc_percent > 0 && r.acc_percent < 100 ? ` ${r.acc_percent}%` : ''}
                                                    </Badge>
                                                    : <span className="text-muted-foreground/40">–</span>}
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

            <PoDetailDialog row={detailRow} onClose={() => setDetailRow(null)} />
        </AppLayout>
    );
}

/** Perbandingan baris item satu PO: ERP vs Accurate berdampingan (Accurate diambil live). */
function PoDetailDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
    const [detail, setDetail] = useState<PoDetail | null>(null);

    useEffect(() => {
        if (!row) { setDetail(null); return; }
        fetch(route('purchase-monitor.po-detail') + `?number=${encodeURIComponent(row.number)}`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then(setDetail)
            .catch(() => setDetail(null));
    }, [row]);

    return (
        <Dialog open={row !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Baris Item {row?.number} — {row?.vendor}</DialogTitle>
                    <DialogDescription>
                        Perbandingan item per baris: ERP vs Accurate (diambil langsung dari Accurate) — untuk melihat sumber selisih: beda qty, harga satuan, atau baris yang hanya ada di satu sisi.
                    </DialogDescription>
                </DialogHeader>

                {detail === null ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat baris item…</div>
                ) : (
                    <>
                    {detail.erp.total_ht !== null && detail.acc.total !== null && Math.abs(detail.acc.total - detail.erp.total_ht * 1.11) < 2 && Math.abs(detail.acc.total - detail.erp.total_ht) >= 1 && (
                        <p className="rounded-md border border-sky-400/50 bg-sky-500/10 p-2.5 text-xs text-sky-700 dark:text-sky-400">
                            Selisih total = <b>persis PPN 11%</b> — nilai Accurate termasuk pajak, PO ERP di-input tanpa pajak. Baris itemnya kemungkinan sama.
                        </p>
                    )}
                    <div className="grid gap-4 md:grid-cols-2">
                        <LinePanel title={`ERP${detail.erp.cur ? ` · ${detail.erp.cur}` : ''}`} found={detail.erp.found}
                            lines={detail.erp.lines} total={detail.erp.total_ht} totalLabel="Total non-PPN"
                            extra={detail.erp.total_ttc !== null && detail.erp.total_ttc !== detail.erp.total_ht ? `+PPN: ${num(detail.erp.total_ttc, 2)}` : null} />
                        <LinePanel title={`Accurate${detail.acc.cur ? ` · ${detail.acc.cur}` : ''}${detail.acc.status ? ` · ${detail.acc.status}` : ''}`} found={detail.acc.found}
                            lines={detail.acc.lines} total={detail.acc.total} totalLabel="Total dokumen"
                            extra={detail.acc.error} />
                    </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function LinePanel({ title, found, lines, total, totalLabel, extra }: {
    title: string; found: boolean; lines: Line[]; total: number | null; totalLabel: string; extra: string | null;
}) {
    return (
        <div className="rounded-lg border">
            <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">{title}</div>
            {!found ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">PO tidak ditemukan di sisi ini.</p>
            ) : (
                <>
                    <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-7 [&_th]:px-2.5">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">Harga</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {lines.length === 0 ? (
                                <TableRow><TableCell colSpan={4} className="py-4 text-center text-muted-foreground">Tanpa baris item.</TableCell></TableRow>
                            ) : lines.map((l, i) => (
                                <TableRow key={i}>
                                    <TableCell className="max-w-48 truncate" title={l.label}>{l.label}</TableCell>
                                    <TableCell className="text-right tabular-nums">{num(l.qty, 2)}</TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap">{num(l.price, 2)}</TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap">{num(l.total, 2)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
                        <span className="text-muted-foreground">{totalLabel}</span>
                        <span className="font-semibold tabular-nums">{total !== null ? num(total, 2) : '–'}</span>
                    </div>
                    {extra && <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">{extra}</p>}
                </>
            )}
        </div>
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
