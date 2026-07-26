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
import { Banknote, GitCompareArrows, LayoutGrid, Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

type Status = 'match' | 'diff' | 'cur_mix' | 'acc_only' | 'dol_only';
interface Part { cur: string; total: number; docs: number }
interface Row { vendor: string; tahun: string; acc_parts: Part[]; dol_parts: Part[]; selisih: number | null; status: Status }
interface BankAccount { id: number; ref: string; label: string; currency: string | null }
interface PaymentMode { id: number; code: string; label: string }
interface Po { id: number; ref: string; ref_supplier: string | null; tanggal: string; cur: string; total: number; total_ttc: number; statut: number; invoice_refs: string | null; invoice_paid: boolean | null }
interface AccPayment { number: string; trans_date: string; bank_no: string | null; bank_name: string | null; payment_method: string | null; invoice_number: string | null; bill_number: string | null; amount: number }
interface AccDoc { doc_number: string; trans_date: string; cur: string; po_number: string | null; total: number; n_items: number }
interface AccPo { status_name: string | null; percent_shipped: number | null; currency: string | null; rate: number | null; total: number }
interface DolPoInfo { tanggal: string | null; cur: string; statut: number }
interface Props {
    rows: Row[];
    years: string[];
    summary: { match: number; diff: number; cur_mix: number; acc_only: number; dol_only: number };
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
/** Ringkas total campuran mata uang: "IDR 833.756.000 + USD 21.630". */
const sumByCur = (items: { cur: string; total: number }[]) => {
    const acc: Record<string, number> = {};
    for (const it of items) acc[it.cur] = (acc[it.cur] ?? 0) + it.total;
    return Object.entries(acc).map(([c, t]) => `${c} ${num(t, 0)}`).join(' + ') || '0';
};

const STATUS: Record<Status, { label: string; cls: string }> = {
    match: { label: 'Cocok', cls: 'border-emerald-400 text-emerald-600 dark:text-emerald-400' },
    diff: { label: 'Selisih', cls: 'border-amber-400 text-amber-600 dark:text-amber-400' },
    cur_mix: { label: 'Beda Mata Uang', cls: 'border-slate-400 text-slate-600 dark:text-slate-400' },
    acc_only: { label: 'Hanya Accurate', cls: 'border-sky-400 text-sky-600 dark:text-sky-400' },
    dol_only: { label: 'Hanya ERP', cls: 'border-violet-400 text-violet-600 dark:text-violet-400' },
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
                        <h1 className="text-2xl font-semibold">Rekonsiliasi Pembelian — Accurate vs ERP</h1>
                        <p className="text-sm text-muted-foreground">
                            Dicocokkan per <b>vendor × tahun × mata uang</b> (kedua sistem tak berbagi nomor dokumen), membandingkan <b>nilai asli non-PPN</b> —
                            Accurate menyimpan nilai net, jadi sisi ERP memakai total HT dari <b>PO</b> berstatus approved / ordered / partial / full receive.
                        </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
                            <Link href={route('purchase-monitor.po-reconciliation')}><GitCompareArrows className="size-3.5" /> Rekon PO</Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
                            <Link href={route('purchase-monitor.index')}><LayoutGrid className="size-3.5" /> Dashboard</Link>
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <StatCard label="Cocok" value={summary.match} active={status === 'match'} onClick={() => setStatus(status === 'match' ? null : 'match')} tone="match" />
                    <StatCard label="Selisih Nilai" value={summary.diff} active={status === 'diff'} onClick={() => setStatus(status === 'diff' ? null : 'diff')} tone="diff" />
                    <StatCard label="Beda Mata Uang" value={summary.cur_mix} active={status === 'cur_mix'} onClick={() => setStatus(status === 'cur_mix' ? null : 'cur_mix')} tone="cur_mix" />
                    <StatCard label="Hanya di Accurate" value={summary.acc_only} active={status === 'acc_only'} onClick={() => setStatus(status === 'acc_only' ? null : 'acc_only')} tone="acc_only" />
                    <StatCard label="Hanya di ERP" value={summary.dol_only} active={status === 'dol_only'} onClick={() => setStatus(status === 'dol_only' ? null : 'dol_only')} tone="dol_only" />
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
                                        <TableHead className="text-right">ERP (PO)</TableHead>
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
                                            <TableCell className="whitespace-nowrap">
                                                {[...new Set([...r.acc_parts, ...r.dol_parts].map((p) => p.cur))].join(' / ')}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums whitespace-nowrap">
                                                {r.acc_parts.length === 0 ? <span className="text-muted-foreground/40">–</span> : r.acc_parts.map((p) => (
                                                    <div key={p.cur}>
                                                        {r.acc_parts.length + r.dol_parts.length > 2 && <span className="mr-1 text-[10px] text-muted-foreground">{p.cur}</span>}
                                                        {num(p.total, 2)}<span className="ml-1 text-[10px] text-muted-foreground">({p.docs})</span>
                                                    </div>
                                                ))}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums whitespace-nowrap">
                                                {r.dol_parts.length === 0 ? <span className="text-muted-foreground/40">–</span> : r.dol_parts.map((p) => (
                                                    <div key={p.cur}>
                                                        {r.acc_parts.length + r.dol_parts.length > 2 && <span className="mr-1 text-[10px] text-muted-foreground">{p.cur}</span>}
                                                        {num(p.total, 2)}<span className="ml-1 text-[10px] text-muted-foreground">({p.docs})</span>
                                                    </div>
                                                ))}
                                            </TableCell>
                                            <TableCell className={`text-right tabular-nums whitespace-nowrap ${r.selisih !== null && Math.abs(r.selisih) >= 1 ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                                {r.selisih !== null ? num(r.selisih, 2) : '–'}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="outline" className={`text-[10px] ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</Badge>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setPoRow(r)}>
                                                    <Banknote className="size-3.5" /> Detail
                                                </Button>
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
    const [accDocs, setAccDocs] = useState<AccDoc[]>([]);
    const [accPos, setAccPos] = useState<Record<string, AccPo>>({});
    const [dolAllPos, setDolAllPos] = useState<Record<string, DolPoInfo>>({});
    const [payments, setPayments] = useState<AccPayment[]>([]);
    const [payingPo, setPayingPo] = useState<Po | null>(null);

    useEffect(() => {
        if (!row) { setPos(null); setAccDocs([]); setAccPos({}); setDolAllPos({}); setPayments([]); setPayingPo(null); return; }
        fetch(route('purchase-monitor.recon-pos') + `?vendor=${encodeURIComponent(row.vendor)}&year=${row.tahun}`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((d) => { setPos(d.pos ?? []); setAccDocs(d.accDocs ?? []); setAccPos(d.accPos ?? {}); setDolAllPos(d.dolAllPos ?? {}); setPayments(d.payments ?? []); })
            .catch(() => setPos([]));
    }, [row]);

    // Pasangkan PO ↔ dokumen Accurate. Utama: nomor PO per baris faktur (eksak — alur bisnis:
    // PO lahir di Dolibarr lalu di-input ke Accurate dgn nomor sama, jadi realisasi parsial &
    // faktur multi-PO ikut terurai). Fallback utk data lama tanpa po_number: samakan nilai.
    const { pairedDocs, unpairedDocs } = useMemo(() => {
        const used = new Set<number>();
        const map = new Map<number, AccDoc[]>(); // po.id → potongan dokumen Accurate
        for (const po of pos ?? []) {
            const mine: AccDoc[] = [];
            accDocs.forEach((d, idx) => {
                if (!used.has(idx) && d.po_number === po.ref) { used.add(idx); mine.push(d); }
            });
            if (mine.length) map.set(po.id, mine);
        }
        for (const po of pos ?? []) {
            if (map.has(po.id)) continue;
            const i = accDocs.findIndex((d, idx) => !used.has(idx) && !d.po_number && d.cur === po.cur && Math.abs(d.total - po.total) < 1);
            if (i >= 0) { used.add(i); map.set(po.id, [accDocs[i]]); }
        }
        return { pairedDocs: map, unpairedDocs: accDocs.filter((_, idx) => !used.has(idx)) };
    }, [pos, accDocs]);

    const PO_STATUS: Record<number, string> = { 2: 'Approved', 3: 'Ordered', 4: 'Diterima sebagian', 5: 'Diterima penuh' };

    return (
        <Dialog open={row !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>PO ERP vs Dokumen Accurate — {row?.vendor} · {row?.tahun}</DialogTitle>
                    <DialogDescription>
                        Tiap PO dipasangkan dengan dokumen Accurate lewat <b>nomor PO</b> (data lama tanpa nomor: lewat kesamaan nilai). Dari PO juga bisa dibuat faktur + payment lunas di ERP.
                    </DialogDescription>
                </DialogHeader>

                {!erpApiReady && (
                    <p className="rounded-md border border-amber-400/50 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
                        REST API ERP belum dikonfigurasi — aktifkan modul <b>Web services API REST</b> di ERP lalu isi <code>ERP_API_URL</code> &amp; <code>ERP_API_KEY</code> di .env. Daftar PO tetap bisa dilihat.
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
                                <TableHead className="text-right">Non-PPN</TableHead>
                                <TableHead className="text-right">+PPN</TableHead>
                                <TableHead>Dok Accurate</TableHead>
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
                                        {(() => {
                                            const ap = accPos[po.ref];
                                            if (!ap) return <div className="text-[10px] font-normal text-muted-foreground/60">tak ada di PO Accurate</div>;
                                            const done = ap.status_name === 'Terproses';
                                            return (
                                                <div className={`text-[10px] font-normal ${done ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                                    Acc: {ap.status_name}{ap.percent_shipped !== null && ap.percent_shipped > 0 && ap.percent_shipped < 100 ? ` ${ap.percent_shipped}%` : ''}
                                                    {ap.currency && ap.currency !== 'IDR' && <span className="ml-1 text-muted-foreground">{ap.currency}{ap.rate ? ` @${num(ap.rate, 0)}` : ''}</span>}
                                                </div>
                                            );
                                        })()}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">{po.tanggal}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-[10px]">{PO_STATUS[po.statut] ?? po.statut}</Badge></TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                                        <span className="mr-1 text-[10px] text-muted-foreground">{po.cur}</span>{num(po.total, 2)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground">
                                        {po.total_ttc !== po.total ? num(po.total_ttc, 2) : <span className="text-muted-foreground/40">–</span>}
                                    </TableCell>
                                    <TableCell>
                                        {(() => {
                                            const docs = pairedDocs.get(po.id);
                                            if (!docs) return <span className="text-[11px] text-amber-600 dark:text-amber-400">tanpa pasangan</span>;
                                            const realisasi = docs.reduce((s, d) => s + d.total, 0);
                                            const penuh = Math.abs(realisasi - po.total) < 1;
                                            return (
                                                <span className={`text-[11px] ${penuh ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                                    {penuh ? '✓' : '◐'} {docs.map((d) => d.doc_number).join(', ')}
                                                    <span className="ml-1 text-muted-foreground">({num(realisasi, 0)}{penuh ? '' : ` dari ${num(po.total, 0)}`})</span>
                                                </span>
                                            );
                                        })()}
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

                {pos !== null && (pos.length > 0 || accDocs.length > 0) && (
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                        <span>PO ERP: <b className="text-foreground">{pos.length}</b> ({sumByCur(pos ?? [])} non-PPN)</span>
                        <span>Dok Accurate: <b className="text-foreground">{accDocs.length}</b> ({sumByCur(accDocs)})</span>
                        <span>PO berpasangan: <b className="text-foreground">{pairedDocs.size}</b></span>
                    </div>
                )}

                {unpairedDocs.length > 0 && (
                    <div>
                        <p className="mb-1 text-xs font-medium text-amber-600 dark:text-amber-400">Dokumen Accurate tanpa pasangan PO ({unpairedDocs.length}):</p>
                        <div className="max-h-40 overflow-y-auto rounded-md border">
                            {unpairedDocs.map((d, i) => (
                                <div key={`${d.doc_number}-${i}`} className="flex items-center justify-between gap-2 border-b px-2.5 py-1.5 text-xs last:border-b-0">
                                    <span className="min-w-0">
                                        <span className="font-medium">{d.doc_number}</span>
                                        <span className="ml-1.5 text-muted-foreground">{d.trans_date} · {d.n_items} item</span>
                                        {d.po_number && (() => {
                                            const info = dolAllPos[d.po_number];
                                            if (!info) return <span className="ml-1.5 text-red-600 dark:text-red-400">→ {d.po_number} (tak ada di ERP)</span>;
                                            return (
                                                <span className="ml-1.5 text-sky-600 dark:text-sky-400">
                                                    → {d.po_number}
                                                    <span className="text-muted-foreground"> ada di ERP: {info.cur} · {info.tanggal} — di luar sel ini</span>
                                                </span>
                                            );
                                        })()}
                                    </span>
                                    <span className="shrink-0 tabular-nums"><span className="mr-1 text-[10px] text-muted-foreground">{d.cur}</span>{num(d.total, 2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {payingPo && (
                    <PayForm po={payingPo} cur={payingPo.cur} bankAccounts={bankAccounts} paymentModes={paymentModes} accPayments={payments}
                        onDone={() => { setPayingPo(null); onClose(); }} onCancel={() => setPayingPo(null)} />
                )}
            </DialogContent>
        </Dialog>
    );
}

/** Peta cara bayar Accurate → kode c_paiement Dolibarr. */
const METHOD_TO_CODE: Record<string, string> = { BANK_TRANSFER: 'VIR', CASH: 'LIQ', CHEQUE: 'CHQ', CREDIT_CARD: 'CB' };

/** Form kecil: tanggal bayar, rekening, cara bayar → POST pay-po. Klik payment Accurate = isi otomatis. */
function PayForm({ po, cur, bankAccounts, paymentModes, accPayments, onDone, onCancel }: {
    po: Po; cur: string; bankAccounts: BankAccount[]; paymentModes: PaymentMode[]; accPayments: AccPayment[]; onDone: () => void; onCancel: () => void;
}) {
    // Default rekening: yang mata uangnya sama dengan PO, kalau ada.
    const defaultBank = bankAccounts.find((b) => (b.currency ?? 'IDR') === cur) ?? bankAccounts[0];
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [bank, setBank] = useState(defaultBank ? String(defaultBank.id) : '');
    const [mode, setMode] = useState(paymentModes.find((m) => m.code === 'VIR') ? String(paymentModes.find((m) => m.code === 'VIR')!.id) : (paymentModes[0] ? String(paymentModes[0].id) : ''));
    const [note, setNote] = useState('');
    const [picked, setPicked] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // Payment yang jumlahnya sama dengan PO (non-PPN atau +PPN) ditaruh paling atas.
    const matches = (p: AccPayment) => Math.abs(p.amount - po.total) < 1 || Math.abs(p.amount - po.total_ttc) < 1;
    const sortedPayments = [...accPayments].sort((a, b) => Number(matches(b)) - Number(matches(a)) || (b.trans_date ?? '').localeCompare(a.trans_date ?? ''));

    const pickPayment = (p: AccPayment) => {
        setPicked(p.number);
        if (p.trans_date) setDate(p.trans_date);
        const b = bankAccounts.find((x) => x.ref === p.bank_no);
        if (b) setBank(String(b.id));
        const m = paymentModes.find((x) => x.code === METHOD_TO_CODE[p.payment_method ?? '']);
        if (m) setMode(String(m.id));
        setNote(`Accurate ${p.number}${p.bill_number ? ` (${p.bill_number})` : ''}`);
    };

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

            {sortedPayments.length > 0 && (
                <div className="mb-3">
                    <p className="mb-1 text-[11px] text-muted-foreground">Payment di Accurate — klik untuk mengisi tanggal, rekening &amp; cara bayar otomatis:</p>
                    <div className="max-h-40 overflow-y-auto rounded-md border">
                        {sortedPayments.map((p, i) => (
                            <button key={`${p.number}-${i}`} type="button" onClick={() => pickPayment(p)}
                                className={`flex w-full items-center justify-between gap-2 border-b px-2.5 py-1.5 text-left text-xs transition-colors last:border-b-0 hover:bg-accent ${picked === p.number ? 'bg-primary/10' : ''}`}>
                                <span className="min-w-0">
                                    <span className="font-medium">{p.trans_date}</span>
                                    <span className="ml-1.5 text-muted-foreground">{p.bank_name ?? p.bank_no ?? '?'}</span>
                                    {p.bill_number && <span className="ml-1.5 text-muted-foreground/70">· {p.bill_number}</span>}
                                </span>
                                <span className={`shrink-0 tabular-nums ${matches(p) ? 'font-semibold text-emerald-600 dark:text-emerald-400' : ''}`}>
                                    {num(p.amount, 0)}{matches(p) && ' ✓'}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

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
                Di ERP akan dibuat: faktur supplier dari baris PO (tertaut ke PO) → validasi → payment lunas ke rekening terpilih.
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
