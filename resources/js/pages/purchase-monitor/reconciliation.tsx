import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Banknote, LayoutGrid, Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

type Status = 'match' | 'diff' | 'acc_only' | 'dol_only';
interface Row { vendor: string; tahun: string; cur: string; acc: number; acc_docs: number; dol: number; dol_docs: number; selisih: number; status: Status }
interface BankAccount { id: number; label: string; currency: string | null }
interface PaymentMode { id: number; code: string; label: string }
interface Po { id: number; ref: string; ref_supplier: string | null; tanggal: string; total: number; total_ttc: number; statut: number; invoice_refs: string | null; invoice_paid: boolean | null }
interface Props {
    rows: Row[];
    years: string[];
    summary: { match: number; diff: number; acc_only: number; dol_only: number };
    erpApiReady: boolean;
    bankAccounts: BankAccount[];
    paymentModes: PaymentMode[];
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

export default function PurchaseReconciliation({ rows, years, summary, erpApiReady, bankAccounts, paymentModes }: Props) {
    const [q, setQ] = useState('');
    const [year, setYear] = useState<string | null>(null);
    const [status, setStatus] = useState<Status | null>(null);
    const [poRow, setPoRow] = useState<Row | null>(null);

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
                            Dicocokkan per <b>vendor × tahun × mata uang</b> (kedua sistem tak berbagi nomor dokumen), membandingkan <b>nilai asli non-PPN</b> —
                            Accurate menyimpan nilai net, jadi sisi Dolibarr memakai total HT dari <b>PO</b> berstatus approved / ordered / partial / full receive.
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
                                        <TableHead />
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
                                            <TableCell className="text-center">
                                                {r.dol_docs > 0 && (
                                                    <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setPoRow(r)}>
                                                        <Banknote className="size-3.5" /> PO
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <PoDialog row={poRow} onClose={() => setPoRow(null)} erpApiReady={erpApiReady} bankAccounts={bankAccounts} paymentModes={paymentModes} />
        </AppLayout>
    );
}

/** Daftar PO Dolibarr utk satu sel rekon + form buat faktur & payment per PO. */
function PoDialog({ row, onClose, erpApiReady, bankAccounts, paymentModes }: {
    row: Row | null; onClose: () => void; erpApiReady: boolean; bankAccounts: BankAccount[]; paymentModes: PaymentMode[];
}) {
    const [pos, setPos] = useState<Po[] | null>(null);
    const [payingPo, setPayingPo] = useState<Po | null>(null);

    useEffect(() => {
        if (!row) { setPos(null); setPayingPo(null); return; }
        fetch(route('purchase-monitor.recon-pos') + `?vendor=${encodeURIComponent(row.vendor)}&year=${row.tahun}&cur=${row.cur}`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((d) => setPos(d.pos ?? []))
            .catch(() => setPos([]));
    }, [row]);

    const PO_STATUS: Record<number, string> = { 2: 'Approved', 3: 'Ordered', 4: 'Diterima sebagian', 5: 'Diterima penuh' };

    return (
        <Dialog open={row !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>PO Dolibarr — {row?.vendor} · {row?.tahun} · {row?.cur}</DialogTitle>
                    <DialogDescription>
                        Buat faktur supplier + catat payment lunas di Dolibarr dari PO (pembayaran riil sudah terjadi di Accurate).
                    </DialogDescription>
                </DialogHeader>

                {!erpApiReady && (
                    <p className="rounded-md border border-amber-400/50 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
                        REST API Dolibarr belum dikonfigurasi — aktifkan modul <b>Web services API REST</b> di Dolibarr lalu isi <code>ERP_API_URL</code> &amp; <code>ERP_API_KEY</code> di .env. Daftar PO tetap bisa dilihat.
                    </p>
                )}

                {pos === null ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat PO…</div>
                ) : pos.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada PO untuk sel ini.</p>
                ) : (
                    <Table className="text-sm [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                        <TableHeader>
                            <TableRow>
                                <TableHead>PO</TableHead>
                                <TableHead>Tanggal</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Non-PPN ({row?.cur})</TableHead>
                                <TableHead className="text-right">+PPN</TableHead>
                                <TableHead>Faktur</TableHead>
                                <TableHead />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pos.map((po) => (
                                <TableRow key={po.id}>
                                    <TableCell className="font-medium whitespace-nowrap">
                                        {po.ref}
                                        {po.ref_supplier && <span className="ml-1 text-[10px] text-muted-foreground">({po.ref_supplier})</span>}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">{po.tanggal}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-[10px]">{PO_STATUS[po.statut] ?? po.statut}</Badge></TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap">{num(po.total, 2)}</TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground">
                                        {po.total_ttc !== po.total ? num(po.total_ttc, 2) : <span className="text-muted-foreground/40">–</span>}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap">
                                        {po.invoice_refs
                                            ? <Badge variant="outline" className={`text-[10px] ${po.invoice_paid ? 'border-emerald-400 text-emerald-600 dark:text-emerald-400' : 'border-amber-400 text-amber-600 dark:text-amber-400'}`}>
                                                {po.invoice_refs}{po.invoice_paid ? ' · lunas' : ' · belum lunas'}
                                            </Badge>
                                            : <span className="text-[11px] text-muted-foreground/60">belum ada</span>}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {!po.invoice_refs && po.total !== 0 && (
                                            <Button size="sm" className="h-7 px-2.5 text-xs" disabled={!erpApiReady} onClick={() => setPayingPo(po)}>
                                                Buat payment
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}

                {payingPo && (
                    <PayForm po={payingPo} cur={row?.cur ?? 'IDR'} bankAccounts={bankAccounts} paymentModes={paymentModes}
                        onDone={() => { setPayingPo(null); onClose(); }} onCancel={() => setPayingPo(null)} />
                )}
            </DialogContent>
        </Dialog>
    );
}

/** Form kecil: tanggal bayar, rekening, cara bayar → POST pay-po. */
function PayForm({ po, cur, bankAccounts, paymentModes, onDone, onCancel }: {
    po: Po; cur: string; bankAccounts: BankAccount[]; paymentModes: PaymentMode[]; onDone: () => void; onCancel: () => void;
}) {
    // Default rekening: yang mata uangnya sama dengan PO, kalau ada.
    const defaultBank = bankAccounts.find((b) => (b.currency ?? 'IDR') === cur) ?? bankAccounts[0];
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [bank, setBank] = useState(defaultBank ? String(defaultBank.id) : '');
    const [mode, setMode] = useState(paymentModes.find((m) => m.code === 'VIR') ? String(paymentModes.find((m) => m.code === 'VIR')!.id) : (paymentModes[0] ? String(paymentModes[0].id) : ''));
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = () =>
        router.post(route('purchase-monitor.pay-po'), {
            po_id: po.id, date, bank_account_id: Number(bank), payment_mode_id: Number(mode), note,
        }, { preserveScroll: true, onStart: () => setBusy(true), onFinish: () => setBusy(false), onSuccess: onDone });

    return (
        <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-2 text-sm font-medium">
                Payment untuk {po.ref} — {cur} {num(po.total_ttc, 2)}
                {po.total_ttc !== po.total && <span className="ml-1 font-normal text-muted-foreground">(termasuk PPN; non-PPN {num(po.total, 2)})</span>}
            </p>
            <div className="flex flex-wrap items-end gap-2">
                <div>
                    <label className="text-[11px] text-muted-foreground">Tanggal bayar</label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-36" />
                </div>
                <div>
                    <label className="text-[11px] text-muted-foreground">Rekening bank</label>
                    <Select value={bank} onValueChange={setBank}>
                        <SelectTrigger className="h-8 w-64"><SelectValue placeholder="pilih rekening" /></SelectTrigger>
                        <SelectContent>
                            {bankAccounts.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.label}{b.currency ? ` (${b.currency})` : ''}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <label className="text-[11px] text-muted-foreground">Cara bayar</label>
                    <Select value={mode} onValueChange={setMode}>
                        <SelectTrigger className="h-8 w-40"><SelectValue placeholder="pilih" /></SelectTrigger>
                        <SelectContent>
                            {paymentModes.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="min-w-48 flex-1">
                    <label className="text-[11px] text-muted-foreground">Catatan (opsional)</label>
                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. nomor bukti bayar Accurate" className="h-8" />
                </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" size="sm" className="h-8" onClick={onCancel} disabled={busy}>Batal</Button>
                <Button size="sm" className="h-8 gap-1.5" onClick={submit} disabled={busy || !bank || !mode || !date}>
                    {busy && <Loader2 className="size-3.5 animate-spin" />} {busy ? 'Memproses…' : 'Buat faktur + payment'}
                </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
                Di Dolibarr akan dibuat: faktur supplier dari baris PO (tertaut ke PO) → validasi → payment lunas ke rekening terpilih.
            </p>
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
