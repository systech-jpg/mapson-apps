import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { AlertTriangle, Info, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

interface Pool { code: string; name: string; cost_type: string; product_driver: string; is_active: boolean; note: string | null }
interface Alloc { pool: string; pct: number }
interface Account {
    code: string; name: string | null; type: string; parent: string | null;
    total: number; allocation: Alloc[]; sum: number; is_default: boolean;
}
interface Props { pools: Pool[]; accounts: Account[] }

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Data Warehouse', href: '#' },
    { title: 'Pemetaan Biaya (ABC)', href: '/data-warehouse/cost-mapping' },
];

const rpC = (n: number) => {
    const x = Number(n || 0);
    const s = x < 0 ? '-' : '';
    const a = Math.abs(x);
    if (a >= 1e9) return s + 'Rp ' + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (a >= 1e6) return s + 'Rp ' + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return s + 'Rp ' + a.toLocaleString('id-ID');
};

export default function CostMapping({ pools, accounts }: Props) {
    const [edit, setEdit] = useState<Account | null>(null);
    const [q, setQ] = useState('');
    const poolName = useMemo(() => Object.fromEntries(pools.map((p) => [p.code, p.name])), [pools]);

    const rows = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return accounts;
        return accounts.filter((a) => a.code.toLowerCase().includes(s) || (a.name ?? '').toLowerCase().includes(s));
    }, [accounts, q]);

    const defaults = accounts.filter((a) => a.is_default).length;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Pemetaan Biaya (ABC)" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-2xl font-semibold">Pemetaan Biaya — Activity Based Costing</h1>
                    <p className="text-sm text-muted-foreground">
                        Setiap akun beban dibagi ke pool aktivitas dengan persentase. Di sinilah asumsi yang tak diketahui Manual Import ditetapkan —
                        terutama <b>split gaji per departemen</b> dan <b>porsi gedung untuk gudang</b>. Perubahan langsung memengaruhi P&amp;L per produk.
                    </p>
                </div>

                {defaults > 0 && (
                    <p className="flex items-start gap-1.5 rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        <span><b>{defaults} akun masih memakai split DEFAULT</b> (tebakan awal agar engine jalan). Sesuaikan — khususnya gaji & gedung — agar angka mencerminkan operasional kalian.</span>
                    </p>
                )}

                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Pool Aktivitas</CardTitle></CardHeader>
                    <CardContent>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {pools.map((p) => (
                                <div key={p.code} className="rounded border p-2.5">
                                    <p className="text-sm font-medium">{p.name}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                        <span className={p.cost_type === 'direct' ? 'text-emerald-600 dark:text-emerald-400' : ''}>{p.cost_type === 'direct' ? 'langsung' : 'tak-langsung'}</span>
                                        {' · '}driver: {p.product_driver}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><Info className="size-3" /> Pool bersifat tetap untuk v1; yang diatur di sini adalah pembagian akun ke pool.</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <CardTitle className="text-base">Akun Beban → Pool</CardTitle>
                            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari akun…" className="h-8 w-56" />
                        </div>
                        <p className="text-xs text-muted-foreground">Urut nilai terbesar. <b>Klik baris</b> untuk mengatur pembagiannya.</p>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Kode</TableHead>
                                        <TableHead>Akun</TableHead>
                                        <TableHead className="text-right">Nilai (semua periode)</TableHead>
                                        <TableHead>Alokasi</TableHead>
                                        <TableHead className="text-right">Σ%</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((a) => (
                                        <TableRow key={a.code} className="cursor-pointer hover:bg-accent/50" onClick={() => setEdit(a)}>
                                            <TableCell className="font-mono text-xs whitespace-nowrap">{a.code}</TableCell>
                                            <TableCell className="font-medium">
                                                {a.name}
                                                {a.is_default && <Badge variant="outline" className="ml-1.5 border-amber-400 text-[10px] text-amber-600 dark:text-amber-400">DEFAULT</Badge>}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums whitespace-nowrap">{rpC(a.total)}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {a.allocation.length === 0 ? <span className="text-red-500">— belum dipetakan —</span>
                                                    : a.allocation.map((r) => `${poolName[r.pool] ?? r.pool} ${r.pct}%`).join(' · ')}
                                            </TableCell>
                                            <TableCell className={`text-right tabular-nums font-semibold ${Math.abs(a.sum - 100) < 0.01 ? 'text-emerald-600 dark:text-emerald-400' : a.allocation.length === 0 ? 'text-muted-foreground' : 'text-red-600 dark:text-red-400'}`}>
                                                {a.allocation.length === 0 ? '–' : `${a.sum}%`}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {edit && <EditDialog account={edit} pools={pools} onClose={() => setEdit(null)} />}
        </AppLayout>
    );
}

function EditDialog({ account, pools, onClose }: { account: Account; pools: Pool[]; onClose: () => void }) {
    const [rows, setRows] = useState<Alloc[]>(account.allocation.map((r) => ({ ...r })));
    const [saving, setSaving] = useState(false);
    const sum = Math.round(rows.reduce((t, r) => t + (Number(r.pct) || 0), 0) * 100) / 100;
    const dup = new Set(rows.map((r) => r.pool)).size !== rows.length;
    const valid = (rows.length === 0 || Math.abs(sum - 100) < 0.01) && !dup;

    const setRow = (i: number, patch: Partial<Alloc>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const addRow = () => {
        const used = new Set(rows.map((r) => r.pool));
        const next = pools.find((p) => !used.has(p.code));
        setRows((rs) => [...rs, { pool: next?.code ?? pools[0].code, pct: 0 }]);
    };
    const save = () => {
        setSaving(true);
        router.post(route('dwh.cost-mapping.allocation'), { account_code: account.code, rows }, {
            preserveScroll: true,
            onFinish: () => setSaving(false),
            onSuccess: onClose,
        });
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-base">{account.code} · {account.name}</DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground">Total persentase harus 100%. Kosongkan semua baris untuk menghapus alokasi akun ini.</p>

                <div className="space-y-2">
                    {rows.map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <Select value={r.pool} onValueChange={(v) => setRow(i, { pool: v })}>
                                <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {pools.map((p) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Input type="number" min={0} max={100} step="0.01" value={r.pct}
                                onChange={(e) => setRow(i, { pct: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                                className="h-8 w-24 text-right" />
                            <span className="text-xs text-muted-foreground">%</span>
                            <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                                <Trash2 className="size-4" />
                            </Button>
                        </div>
                    ))}
                    <Button variant="outline" size="sm" className="h-8" onClick={addRow} disabled={rows.length >= pools.length}>
                        <Plus className="mr-1 size-3.5" /> Tambah pool
                    </Button>
                </div>

                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className={`font-semibold tabular-nums ${rows.length === 0 ? 'text-muted-foreground' : Math.abs(sum - 100) < 0.01 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{sum}%</span>
                </div>
                {dup && <p className="text-xs text-red-600 dark:text-red-400">Pool tidak boleh berulang.</p>}

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Batal</Button>
                    <Button onClick={save} disabled={!valid || saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
