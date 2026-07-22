import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { ChevronRight, Link2, Scissors } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

interface Node { id: number; parent_id: number | null; code: string; name: string; kind: 'capex' | 'opex' }
interface Account { code: string; name: string | null; type: string | null; total: number; rows: number; category_id: number | null; is_opex: boolean | null; overrides: number }
interface Row { hash: string; period: string; doc_no: string | null; description: string | null; debit: number; credit: number; amount: number; category_id: number | null; splits: number }
interface SplitItem { label: string; amount: number; category_id: number | null; included: boolean }
interface SplitPayload {
    target: number;
    items: { label: string; amount: number | null }[];
    suggested: number[];
    ambiguous: boolean;
    saved: { label: string; amount: number; category_id: number | null }[];
}
interface Props {
    tree: Node[];
    accounts: Account[];
    summary: { capex: number; opex: number; operational_expense: number };
    periods: string[];
    filter: { year: string | null; month: string | null };
    repair: { row_orphans: number; split_orphans: number; total: number };
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Data Warehouse', href: '#' },
    { title: 'Klasifikasi GL', href: '/data-warehouse/gl-classification' },
];

const TYPE_LABEL: Record<string, string> = {
    EXPENSE: 'Beban Op', OTHER_EXPENSE: 'Beban Non-Op', COGS: 'HPP', FIXED_ASSET: 'Aset Tetap',
    REVENUE: 'Pendapatan', CASH_BANK: 'Kas/Bank', ACCOUNT_RECEIVABLE: 'Piutang', ACCOUNT_PAYABLE: 'Utang',
    INVENTORY: 'Persediaan', ACCUMULATED_DEPRECIATION: 'Ak. Penyusutan', OTHER_INCOME: 'Pdpt Lain',
};

const NONE = 'none';
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const rpC = (n: number) => {
    const x = Number(n || 0);
    const s = x < 0 ? '-' : '';
    const a = Math.abs(x);
    if (a >= 1e9) return s + 'Rp ' + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (a >= 1e6) return s + 'Rp ' + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return s + 'Rp ' + a.toLocaleString('id-ID');
};

/** Ratakan pohon jadi opsi select ber-indentasi (CapEx/OpEx → kategori → sub). */
function useOptions(tree: Node[]) {
    return useMemo(() => {
        const byParent = new Map<number | null, Node[]>();
        tree.forEach((n) => byParent.set(n.parent_id, [...(byParent.get(n.parent_id) ?? []), n]));
        const out: { id: number; label: string; kind: string; depth: number }[] = [];
        const walk = (parent: number | null, depth: number) => {
            (byParent.get(parent) ?? []).forEach((n) => {
                out.push({ id: n.id, label: ' '.repeat(depth * 2) + n.name, kind: n.kind, depth });
                walk(n.id, depth + 1);
            });
        };
        walk(null, 0);
        return out;
    }, [tree]);
}

export default function GlClassification({ tree, accounts, summary, periods, filter, repair }: Props) {
    const options = useOptions(tree);
    const nameById = useMemo(() => Object.fromEntries(tree.map((n) => [n.id, n.name])), [tree]);
    const kindById = useMemo(() => Object.fromEntries(tree.map((n) => [n.id, n.kind])), [tree]);
    const [q, setQ] = useState('');
    const [opexOnly, setOpexOnly] = useState(false);
    const [drill, setDrill] = useState<Account | null>(null);

    // Tahun & bulan tersedia dari daftar periode 'YYYY-MM'.
    const years = useMemo(() => [...new Set(periods.map((p) => p.slice(0, 4)))].sort(), [periods]);
    const months = useMemo(
        () => (filter.year ? periods.filter((p) => p.startsWith(filter.year + '-')).map((p) => p.slice(5, 7)).sort() : []),
        [periods, filter.year],
    );
    const go = (params: { year?: string | null; month?: string | null }) =>
        router.get(route('dwh.gl-classification'), { ...params }, { preserveScroll: true, preserveState: true, replace: true });

    const rows = useMemo(() => {
        const s = q.trim().toLowerCase();
        return accounts.filter((a) => {
            if (opexOnly && !a.is_opex) return false;
            if (!s) return true;
            return a.code.toLowerCase().includes(s) || (a.name ?? '').toLowerCase().includes(s);
        });
    }, [accounts, q, opexOnly]);

    const done = accounts.filter((a) => a.category_id !== null).length;
    const flagged = accounts.filter((a) => a.is_opex).length;

    // Kirim SELALU dua field (kategori + flag) supaya satu tak menghapus yang lain.
    const save = (a: Account, patch: { category_id?: number | null; is_opex?: boolean }) =>
        router.post(route('dwh.gl-classification.account'), {
            account_code: a.code,
            category_id: patch.category_id !== undefined ? patch.category_id : a.category_id,
            is_operational_expense: patch.is_opex !== undefined ? patch.is_opex : !!a.is_opex,
        }, { preserveScroll: true, preserveState: false });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Klasifikasi GL" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-2xl font-semibold">Klasifikasi GL</h1>
                    <p className="text-sm text-muted-foreground">
                        Semua akun GL bisa diklasifikasi ke taksonomi (CapEx/OpEx → departemen) dan ditandai <b>Operational Expense</b>.
                        Cepat: <b>per akun</b>. Untuk akun campur (BBM sales/TS/gudang, atau Renovasi=CapEx di Office Maintenance) → buka record, <b>override per baris</b>.
                    </p>
                </div>

                {repair.total > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2.5 dark:bg-amber-950/30">
                        <div className="text-xs text-amber-800 dark:text-amber-300">
                            <b>{repair.total} mapping terputus dari baris GL-nya.</b> Ini terjadi saat impor ulang memuat baris yang isinya berubah
                            (keterangan/nominal diperbaiki) — klasifikasinya tidak hilang, hanya kehilangan sambungan.
                            {repair.split_orphans > 0 && <> Termasuk <b>{repair.split_orphans}</b> baris yang sudah dipecah.</>}
                        </div>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 border-amber-500"
                            onClick={() => router.post(route('dwh.gl-classification.repair'), {}, { preserveScroll: true })}>
                            <Link2 className="size-3.5" /> Sambungkan ulang
                        </Button>
                    </div>
                )}

                <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 w-12 text-xs font-medium text-muted-foreground">Tahun</span>
                        <Seg active={!filter.year} onClick={() => go({ year: null, month: null })}>Semua</Seg>
                        {years.map((y) => (
                            <Seg key={y} active={filter.year === y} onClick={() => go({ year: y, month: null })}>{y}</Seg>
                        ))}
                    </div>
                    {filter.year && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="mr-1 w-12 text-xs font-medium text-muted-foreground">Bulan</span>
                            <Seg active={!filter.month} onClick={() => go({ year: filter.year, month: null })}>Semua</Seg>
                            {months.map((m) => (
                                <Seg key={m} active={filter.month === m} onClick={() => go({ year: filter.year, month: m })}>
                                    {MONTHS[parseInt(m, 10)]}
                                </Seg>
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                    <SumCard label="Operational Expense" value={rpC(summary.operational_expense)} sub={`${flagged} akun ditandai`} tone="opex" />
                    <SumCard label="CapEx" value={rpC(summary.capex)} tone="capex" />
                    <SumCard label="OpEx (taksonomi)" value={rpC(summary.opex)} tone="opex" />
                    <SumCard label="Akun terklasifikasi" value={`${done} / ${accounts.length}`} sub="punya kategori" />
                </div>

                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <CardTitle className="text-base">Akun GL</CardTitle>
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <input type="checkbox" checked={opexOnly} onChange={(e) => setOpexOnly(e.target.checked)} /> hanya Operational Expense
                                </label>
                                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari akun…" className="h-8 w-52" />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">{rows.length} akun · biaya/aset di atas. Centang <b>Op.Ex</b> untuk beban operasional; pilih kategori; buka record untuk override.</p>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table className="text-sm [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Kode</TableHead>
                                        <TableHead>Akun</TableHead>
                                        <TableHead>Tipe</TableHead>
                                        <TableHead className="text-right">Nilai</TableHead>
                                        <TableHead className="text-center">Op.Ex</TableHead>
                                        <TableHead className="w-60">Kategori (per akun)</TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((a) => (
                                        <TableRow key={a.code}>
                                            <TableCell className="font-mono text-xs whitespace-nowrap">{a.code}</TableCell>
                                            <TableCell className="font-medium">{a.name}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{a.type ? (TYPE_LABEL[a.type] ?? a.type) : '–'}</TableCell>
                                            <TableCell className="text-right tabular-nums whitespace-nowrap">
                                                {rpC(a.total)}
                                                {a.overrides > 0 && <Badge variant="outline" className="ml-1 border-sky-400 text-[10px] text-sky-600 dark:text-sky-400">{a.overrides} ovr</Badge>}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <input type="checkbox" checked={!!a.is_opex} onChange={(e) => save(a, { is_opex: e.target.checked })} />
                                            </TableCell>
                                            <TableCell>
                                                <Select value={a.category_id ? String(a.category_id) : NONE} onValueChange={(v) => save(a, { category_id: v === NONE ? null : Number(v) })}>
                                                    <SelectTrigger className={`h-8 ${a.category_id ? '' : 'text-muted-foreground'}`}><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value={NONE}>— belum —</SelectItem>
                                                        {options.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.label}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setDrill(a)}>
                                                    record <ChevronRight className="size-3.5" />
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

            {drill && <RecordDialog account={drill} options={options} nameById={nameById} kindById={kindById} onClose={() => setDrill(null)} />}
        </AppLayout>
    );
}

function RecordDialog({ account, options, nameById, kindById, onClose }: {
    account: Account; options: { id: number; label: string; depth: number }[];
    nameById: Record<number, string>; kindById: Record<number, string>; onClose: () => void;
}) {
    const [rows, setRows] = useState<Row[] | null>(null);
    const [q, setQ] = useState('');
    const [splitFor, setSplitFor] = useState<Row | null>(null);

    if (rows === null) {
        fetch(route('dwh.gl-classification.rows') + '?account_code=' + encodeURIComponent(account.code))
            .then((r) => r.json()).then((d) => setRows(d.rows ?? []));
    }

    const setRow = (hash: string, v: string) => {
        const category_id = v === NONE ? null : Number(v);
        setRows((rs) => (rs ? rs.map((r) => (r.hash === hash ? { ...r, category_id } : r)) : rs));
        router.post(route('dwh.gl-classification.row'), { hash, category_id }, { preserveScroll: true, preserveState: true, only: ['summary', 'accounts'] });
    };

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        return (rows ?? []).filter((r) => !s || (r.description ?? '').toLowerCase().includes(s) || (r.doc_no ?? '').toLowerCase().includes(s));
    }, [rows, q]);

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle className="text-base">{account.code} · {account.name} — override per record</DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground">
                    Baris tanpa override ikut kategori akun. Isi kategori di sini untuk record yang berbeda (mis. BBM per kendaraan → sales/TS/gudang).
                </p>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari keterangan / no bukti…" className="h-8" />
                <div className="max-h-[60vh] overflow-auto">
                    <Table className="text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:h-7 [&_th]:px-2">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Periode</TableHead>
                                <TableHead>No Bukti</TableHead>
                                <TableHead>Keterangan</TableHead>
                                <TableHead className="text-right">Debit</TableHead>
                                <TableHead className="w-52">Override</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows === null ? (
                                <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Memuat…</TableCell></TableRow>
                            ) : filtered.map((r) => (
                                <TableRow key={r.hash} className={r.splits > 0 ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : r.category_id ? 'bg-sky-50/50 dark:bg-sky-950/20' : ''}>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.period}</TableCell>
                                    <TableCell className="whitespace-nowrap font-mono">{r.doc_no}</TableCell>
                                    <TableCell className="max-w-[320px] truncate" title={r.description ?? ''}>{r.description}</TableCell>
                                    <TableCell className="text-right tabular-nums whitespace-nowrap">{rpC(r.debit)}</TableCell>
                                    <TableCell>
                                        {r.splits > 0 ? (
                                            <Badge variant="outline" className="border-emerald-400 text-[10px] text-emerald-700 dark:text-emerald-400">
                                                dipecah {r.splits} item
                                            </Badge>
                                        ) : (
                                            <Select value={r.category_id ? String(r.category_id) : NONE} onValueChange={(v) => setRow(r.hash, v)}>
                                                <SelectTrigger className={`h-7 ${r.category_id ? '' : 'text-muted-foreground'}`}><SelectValue placeholder="ikut akun" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={NONE}>— ikut akun —</SelectItem>
                                                    {options.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.label}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setSplitFor(r)}>
                                            <Scissors className="size-3" /> Pecah
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </DialogContent>
            {splitFor && (
                <SplitDialog
                    row={splitFor}
                    options={options}
                    onClose={(saved) => {
                        setSplitFor(null);
                        if (saved) setRows(null);   // muat ulang daftar agar badge "dipecah" ikut segar
                    }}
                />
            )}
        </Dialog>
    );
}

/**
 * Pecah satu baris GL jadi beberapa sub-transaksi berkategori sendiri.
 * Total pecahan wajib sama dengan nilai baris supaya laporan tetap tie-back ke GL.
 */
function SplitDialog({ row, options, onClose }: {
    row: Row; options: { id: number; label: string; depth: number }[]; onClose: (saved?: boolean) => void;
}) {
    const [data, setData] = useState<SplitPayload | null>(null);
    const [items, setItems] = useState<SplitItem[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(route('dwh.gl-classification.split-detail') + '?hash=' + encodeURIComponent(row.hash))
            .then((r) => r.json())
            .then((d: SplitPayload) => {
                setData(d);
                setItems(
                    d.saved.length > 0
                        ? d.saved.map((s) => ({ ...s, included: true }))
                        : d.items.map((it, i) => ({ label: it.label, amount: it.amount ?? 0, category_id: null, included: d.suggested.includes(i) })),
                );
            });
    }, [row.hash]);

    const target = data?.target ?? row.amount;
    const chosen = items.filter((i) => i.included);
    const total = chosen.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const diff = target - total;
    const balanced = Math.abs(diff) < 0.01 && chosen.length > 0;

    const patch = (idx: number, p: Partial<SplitItem>) => setItems((xs) => xs.map((x, i) => (i === idx ? { ...x, ...p } : x)));

    const submit = (payload: SplitItem[]) =>
        router.post(route('dwh.gl-classification.split'), {
            hash: row.hash,
            items: payload.map(({ label, amount, category_id }) => ({ label, amount, category_id })),
        }, {
            preserveScroll: true, preserveState: true, only: ['summary', 'accounts'],
            onSuccess: () => onClose(true),
            onError: (e) => setError(Object.values(e)[0] as string),
        });

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="text-base">Pecah baris — {row.doc_no}</DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground">
                    Memo dokumen disalin ke semua baris GL, jadi satu baris bisa memuat beberapa transaksi.
                    Centang sub-item yang benar-benar milik baris ini dan beri kategori masing-masing.
                    <b> Total pecahan harus sama dengan nilai baris.</b>
                </p>

                {data?.ambiguous && (
                    <div className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        ⚠️ Ada <b>lebih dari satu</b> kombinasi sub-item yang jumlahnya pas. Usulan di bawah cuma salah satunya — mohon periksa.
                    </div>
                )}
                {error && <div className="rounded-md border border-red-400 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

                <div className="max-h-[50vh] overflow-auto">
                    <Table className="text-xs [&_td]:px-2 [&_td]:py-1.5 [&_th]:h-7 [&_th]:px-2">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-8"></TableHead>
                                <TableHead>Sub-transaksi</TableHead>
                                <TableHead className="w-32 text-right">Nominal</TableHead>
                                <TableHead className="w-52">Kategori</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data === null ? (
                                <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Memuat…</TableCell></TableRow>
                            ) : items.length === 0 ? (
                                <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Memo baris ini tidak punya rincian yang bisa dibaca.</TableCell></TableRow>
                            ) : items.map((it, i) => (
                                <TableRow key={i} className={it.included ? '' : 'opacity-45'}>
                                    <TableCell><input type="checkbox" checked={it.included} onChange={(e) => patch(i, { included: e.target.checked })} /></TableCell>
                                    <TableCell className="max-w-[280px] truncate" title={it.label}>{it.label}</TableCell>
                                    <TableCell>
                                        <Input type="number" value={it.amount} disabled={!it.included}
                                            onChange={(e) => patch(i, { amount: Number(e.target.value) })}
                                            className="h-7 text-right tabular-nums" />
                                    </TableCell>
                                    <TableCell>
                                        <Select value={it.category_id ? String(it.category_id) : NONE} disabled={!it.included}
                                            onValueChange={(v) => patch(i, { category_id: v === NONE ? null : Number(v) })}>
                                            <SelectTrigger className={`h-7 ${it.category_id ? '' : 'text-muted-foreground'}`}><SelectValue placeholder="pilih" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={NONE}>— belum —</SelectItem>
                                                {options.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.label}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs">
                    <div className="flex gap-4 tabular-nums">
                        <span>Nilai baris: <b>{rpC(target)}</b></span>
                        <span>Terpilih: <b>{rpC(total)}</b></span>
                        <span className={balanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                            Selisih: <b>{rpC(diff)}</b>
                        </span>
                    </div>
                    <div className="flex gap-2">
                        {data && data.saved.length > 0 && (
                            <Button variant="outline" size="sm" className="h-8" onClick={() => submit([])}>Batalkan pecahan</Button>
                        )}
                        <Button size="sm" className="h-8" disabled={!balanced} onClick={() => submit(chosen)}>
                            Simpan {chosen.length > 0 && `(${chosen.length} item)`}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
        >
            {children}
        </button>
    );
}

function SumCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'capex' | 'opex' | 'warn' }) {
    const color = tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : tone === 'capex' ? 'text-violet-600 dark:text-violet-400' : tone === 'opex' ? 'text-sky-600 dark:text-sky-400' : '';
    return (
        <Card>
            <CardContent className="p-3.5">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
                {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
            </CardContent>
        </Card>
    );
}
