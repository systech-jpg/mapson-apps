import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Info } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface Pool { code: string; name: string; cost_type: string; driver: string; total: number }
export interface PoolTotals {
    period: string;
    opex_total: number;
    allocated_total: number;
    unmapped_total: number;
    pools: Pool[];
    unmapped: { account_code: string; name: string; amount: number }[];
}
export interface ProductRow {
    ref: string; name: string | null; qty_sold: number; revenue: number;
    cogs: number | null; cogs_missing: boolean; unit_cost: number | null;
    pools: Record<string, number>; opex_direct: number; opex_indirect: number;
    contribution: number | null; net: number | null;
}
export interface ProductPnl {
    period: string;
    pools: Pool[];
    products: ProductRow[];
    driver_totals: { stock: number; sent: number; used: number; revenue: number };
    pool_distributed: Record<string, number>;
}

const rpC = (n: number) => {
    const x = Number(n || 0);
    const s = x < 0 ? '-' : '';
    const a = Math.abs(x);
    if (a >= 1e9) return s + 'Rp ' + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (a >= 1e6) return s + 'Rp ' + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    if (a >= 1e3) return s + 'Rp ' + (a / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' rb';
    return s + 'Rp ' + a.toLocaleString('id-ID');
};
const rp = (n: number) => 'Rp ' + Math.round(Number(n || 0)).toLocaleString('id-ID');
const DRIVER_LABEL: Record<string, string> = {
    direct_cost: 'HPP × qty jual', qty_stock: 'saldo stok', qty_sent: 'unit dikirim',
    qty_used: 'unit terpakai', revenue: 'share revenue', invoice: 'jumlah invoice', flat: 'rata',
};

/** Tahap-1: distribusi opex GL ke pool. */
export function CostPool({ data }: { data: PoolTotals }) {
    const tie = Math.abs(data.opex_total - data.allocated_total) < 1;
    const max = Math.max(...data.pools.map((p) => Math.abs(p.total)), 1);
    return (
        <div className="flex flex-col gap-4">
            <p className="flex items-start gap-1.5 rounded border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>
                    Seluruh <b>beban operasional</b> Buku Besar dibagi ke pool aktivitas lewat pemetaan akun (split %). HPP tidak di sini —
                    ditangani terpisah dari harga beli. Total pool <b>{tie ? 'sama persis' : 'TIDAK sama'}</b> dengan opex GL{' '}
                    ({rpC(data.opex_total)}){tie ? '' : ` — selisih ${rpC(data.opex_total - data.allocated_total)}`}.
                    {data.unmapped.length > 0 && ` ${data.unmapped.length} akun belum terpetakan.`}
                </span>
            </p>
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Biaya per Pool Aktivitas</CardTitle></CardHeader>
                <CardContent className="space-y-2.5">
                    {data.pools.map((p) => (
                        <div key={p.code}>
                            <div className="flex justify-between gap-2 text-xs">
                                <span>
                                    <span className="font-medium">{p.name}</span>
                                    <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                                        {p.cost_type === 'direct' ? 'langsung' : 'tak-langsung'} · driver: {DRIVER_LABEL[p.driver] ?? p.driver}
                                    </span>
                                </span>
                                <span className="shrink-0 font-semibold" title={rp(p.total)}>
                                    {rpC(p.total)}
                                    {data.opex_total > 0 && <span className="ml-1 font-normal text-muted-foreground">· {((p.total / data.opex_total) * 100).toFixed(1)}%</span>}
                                </span>
                            </div>
                            <div className="mt-0.5 h-2 w-full rounded bg-muted">
                                <div className={`h-2 rounded ${p.cost_type === 'direct' ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${(Math.abs(p.total) / max) * 100}%` }} />
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

/** Tahap-2: P&L per produk = revenue − HPP − opex teralokasi. */
export function CostProduct({ data }: { data: ProductPnl }) {
    const [q, setQ] = useState('');
    const [soldOnly, setSoldOnly] = useState(true);

    const rows = useMemo(() => {
        const s = q.trim().toLowerCase();
        return data.products.filter((p) => {
            if (soldOnly && !(p.revenue > 0)) return false;
            if (!s) return true;
            return p.ref.toLowerCase().includes(s) || (p.name ?? '').toLowerCase().includes(s);
        });
    }, [data.products, q, soldOnly]);

    const agg = useMemo(() => {
        const a = { revenue: 0, cogs: 0, storage: 0, delivery: 0, attend: 0, indirect: 0, contribution: 0, net: 0 };
        for (const p of rows) {
            a.revenue += p.revenue;
            a.cogs += p.cogs ?? 0;
            a.storage += p.pools.storage ?? 0;
            a.delivery += p.pools.delivery ?? 0;
            a.attend += p.pools.attend ?? 0;
            a.indirect += p.opex_indirect;
            a.contribution += p.contribution ?? 0;
            a.net += p.net ?? 0;
        }
        return a;
    }, [rows]);

    const missing = data.products.filter((p) => p.cogs_missing).length;
    const cm = agg.revenue > 0 ? (agg.contribution / agg.revenue) * 100 : null;

    return (
        <div className="flex flex-col gap-4">
            <p className="flex items-start gap-1.5 rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                    Biaya operasional per produk adalah <b>alokasi</b> (bukan biaya terlacak): Storage per <i>saldo stok</i>, Delivery per <i>unit dikirim</i>,
                    Attend per <i>unit terpakai</i>, opex lain per <i>share revenue</i>. Persentase pembagi (gaji, gedung) masih <b>DEFAULT</b> — sesuaikan di master.
                    HPP dari harga beli; {missing} produk terjual belum ber-HPP.
                </span>
            </p>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <SumCard label="Pendapatan" value={rpC(agg.revenue)} />
                <SumCard label="HPP" value={rpC(-agg.cogs)} />
                <SumCard label="Opex Langsung" value={rpC(-(agg.storage + agg.delivery + agg.attend))} sub="storage+delivery+attend" />
                <SumCard label="Contribution Margin" value={rpC(agg.contribution)} tone={agg.contribution >= 0 ? 'good' : 'bad'} sub={cm !== null ? `${cm.toFixed(1)}% revenue` : undefined} />
                <SumCard label="Laba Bersih (setelah opex tak-lgs)" value={rpC(agg.net)} tone={agg.net >= 0 ? 'good' : 'bad'} />
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-base">P&L per Produk</CardTitle>
                        <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                                <input type="checkbox" checked={soldOnly} onChange={(e) => setSoldOnly(e.target.checked)} /> hanya yang terjual
                            </label>
                            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari kode / nama…" className="h-8 w-48" />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{rows.length} produk · urut kontribusi tertinggi.</p>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table className="text-sm [&_td]:whitespace-nowrap [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Kode</TableHead>
                                    <TableHead>Produk</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Pendapatan</TableHead>
                                    <TableHead className="text-right">HPP</TableHead>
                                    <TableHead className="text-right">Storage</TableHead>
                                    <TableHead className="text-right">Delivery</TableHead>
                                    <TableHead className="text-right">Attend</TableHead>
                                    <TableHead className="text-right">Opex Lain</TableHead>
                                    <TableHead className="text-right">Kontribusi</TableHead>
                                    <TableHead className="text-right">Margin</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">Tidak ada produk.</TableCell></TableRow>
                                ) : rows.slice(0, 400).map((p) => {
                                    const m = p.contribution !== null && p.revenue > 0 ? (p.contribution / p.revenue) * 100 : null;
                                    return (
                                        <TableRow key={p.ref}>
                                            <TableCell className="font-mono text-xs">{p.ref}</TableCell>
                                            <TableCell className="max-w-[220px] truncate" title={p.name ?? ''}>{p.name ?? '–'}</TableCell>
                                            <TableCell className="text-right tabular-nums text-muted-foreground">{p.qty_sold ? p.qty_sold.toLocaleString('id-ID') : '–'}</TableCell>
                                            <TableCell className="text-right tabular-nums" title={rp(p.revenue)}>{p.revenue ? rpC(p.revenue) : '–'}</TableCell>
                                            <TableCell className={`text-right tabular-nums ${p.cogs_missing ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`} title={p.cogs_missing ? 'HPP belum ada' : rp(-(p.cogs ?? 0))}>
                                                {p.cogs_missing ? '?' : p.cogs ? rpC(-p.cogs) : '–'}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums text-muted-foreground">{p.pools.storage ? rpC(-p.pools.storage) : '–'}</TableCell>
                                            <TableCell className="text-right tabular-nums text-muted-foreground">{p.pools.delivery ? rpC(-p.pools.delivery) : '–'}</TableCell>
                                            <TableCell className="text-right tabular-nums text-muted-foreground">{p.pools.attend ? rpC(-p.pools.attend) : '–'}</TableCell>
                                            <TableCell className="text-right tabular-nums text-muted-foreground" title={rp(-p.opex_indirect)}>{p.opex_indirect ? rpC(-p.opex_indirect) : '–'}</TableCell>
                                            <TableCell className={`text-right font-semibold tabular-nums ${p.contribution !== null && p.contribution < 0 ? 'text-red-600 dark:text-red-400' : ''}`} title={p.contribution !== null ? rp(p.contribution) : ''}>
                                                {p.contribution !== null ? rpC(p.contribution) : '–'}
                                            </TableCell>
                                            <TableCell className={`text-right tabular-nums ${m !== null && m < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>{m !== null ? `${m.toFixed(0)}%` : '–'}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    {rows.length > 400 && <p className="mt-2 text-[11px] text-muted-foreground">Menampilkan 400 dari {rows.length} produk — persempit dengan pencarian.</p>}
                </CardContent>
            </Card>
        </div>
    );
}

function SumCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
    const color = tone === 'bad' ? 'text-red-600 dark:text-red-400' : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : '';
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
