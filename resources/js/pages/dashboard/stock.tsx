import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import DashboardLayout from '@/layouts/dashboard-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { PackageX, TriangleAlert, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StockDrilldownDialog, type StockDrill } from './partials/stock-drilldown';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Warehouse', href: '/dashboard/stock' }];

interface StockRow { ref: string; label: string | null; principal: string | null; qty: number; buffer?: number; kurang?: number; lastSold: string | null; umur?: number | null }
interface StockListRow { ref: string; label: string | null; principal: string | null; category: string | null; qty: number; buffer: number; status: 'habis' | 'menipis' | 'aman'; lastSold: string | null }
interface Mov { period: string; masuk: number; keluar: number; baris: number }
interface Hosp { rs: string; kasus: number; sent: number; used: number; hitRate: number | null }
interface ItemRow { ref: string; label: string; sent: number; used: number; kasus: number; hitRate?: number | null }

interface Props {
    view: 'persediaan' | 'gudang';
    dead: number;
    hasStock: boolean;
    stok: {
        snapshotDate: string;
        snapshotDates: number;
        kpi: { sku: number; bersaldo: number; habis: number; low: number; dead: number; qtyTotal: number };
        list: StockListRow[];
        lowStock: StockRow[];
        deadStock: StockRow[];
        movement: Mov[];
        movementMeta: { from: string | null; to: string | null; rows: number; year: number | null; years: number[] };
    } | null;
    gudang: {
        from: string; to: string; range: { min: string | null; max: string | null };
        summary: { kasus: number; sj: number; rs: number; item: number; itemUsed: number; sent: number; used: number; kembali: number; hitRate: number | null };
        kirim: { sj: number; tindakan: number; belumLapor: number; tanpaSj: number; rs: number };
        kirimByMonth: { period: string; sj: number; tindakan: number; belumLapor: number; rs: number }[];
        ritase: { do: number; tindakan: number; ritDo: number; ritTindakan: number; total: number; menungguTarik: number; porsiTindakan: number | null };
        ritaseByMonth: { period: string; do: number; tindakan: number; menungguTarik: number; ritDo: number; ritTindakan: number; ritase: number }[];
        byMonth: { period: string; kasus: number; sent: number; used: number; hitRate: number | null }[];
        byHospital: Hosp[];
        deadWeight: ItemRow[];
        topUsed: ItemRow[];
    } | null;
}

const num = (n: number) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtP = (p: string) => `${MONTHS[Number(p.split('-')[1]) - 1]} ${p.split('-')[0].slice(2)}`;
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : null);

const VIEWS = [
    { key: 'persediaan', label: 'Persediaan' },
    { key: 'gudang', label: 'Pengiriman Gudang' },
] as const;

function Kpi({ label, value, sub, tone, onClick }: { label: string; value: string; sub?: string; tone?: 'warn' | 'bad'; onClick?: () => void }) {
    const border = tone === 'bad' ? 'border-red-300 dark:border-red-900' : tone === 'warn' ? 'border-amber-300 dark:border-amber-800' : '';
    const color = tone === 'bad' ? 'text-red-600 dark:text-red-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : '';
    return (
        <Card className={`${border} ${onClick ? 'cursor-pointer transition-colors hover:bg-accent/40' : ''}`} onClick={onClick} title={onClick ? 'Klik untuk lihat daftarnya' : undefined}>
            <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
                {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
            </CardContent>
        </Card>
    );
}

/** Batang dua seri per bulan — dipakai untuk mutasi & kirim-vs-pakai. */
function Bars({ data, labelA, labelB, colorA, colorB, onBar }: {
    data: { period: string; a: number; b: number }[];
    labelA: string; labelB: string; colorA: string; colorB: string;
    onBar?: (period: string) => void;
}) {
    const max = Math.max(...data.flatMap((d) => [d.a, d.b]), 1);
    if (data.length === 0) return <p className="text-sm text-muted-foreground">Belum ada data.</p>;
    return (
        <div>
            <div className="mb-2 flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className={`size-3 rounded-sm ${colorA}`} /> {labelA}</span>
                <span className="flex items-center gap-1.5"><span className={`size-3 rounded-sm ${colorB}`} /> {labelB}</span>
                {onBar && <span className="text-muted-foreground">· klik batang untuk detail bulan</span>}
            </div>
            <div className="flex h-44 items-end gap-1">
                {data.map((d) => (
                    <div key={d.period}
                        className={`flex flex-1 flex-col items-center gap-1 rounded ${onBar ? 'cursor-pointer hover:bg-accent/40' : ''}`}
                        onClick={onBar ? () => onBar(d.period) : undefined}
                        title={`${fmtP(d.period)}: ${labelA} ${num(d.a)} · ${labelB} ${num(d.b)}${onBar ? ' — klik untuk detail' : ''}`}>
                        <div className="flex h-36 w-full items-end justify-center gap-0.5">
                            <div className={`w-1/2 rounded-t ${colorA}`} style={{ height: `${(d.a / max) * 100}%` }} />
                            <div className={`w-1/2 rounded-t ${colorB}`} style={{ height: `${(d.b / max) * 100}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{fmtP(d.period)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

const STATUS_STYLE: Record<StockListRow['status'], { label: string; cls: string }> = {
    habis: { label: 'Habis', cls: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300' },
    menipis: { label: 'Menipis', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
    aman: { label: 'Aman', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
};

const PAGE_SIZE = 25;

/** Tabel stok saat ini + buffer. Filter principal, pencarian, status, & paging — semua di klien. */
function StockNow({ list }: { list: StockListRow[] }) {
    const [q, setQ] = useState('');
    const [onlyIssue, setOnlyIssue] = useState(false);
    const [principal, setPrincipal] = useState('__all__');
    const [page, setPage] = useState(1);

    const principals = useMemo(
        () => [...new Set(list.map((r) => r.principal).filter((p): p is string => !!p))].sort(),
        [list],
    );

    const term = q.trim().toLowerCase();
    const rows = useMemo(
        () =>
            list.filter((r) => {
                if (onlyIssue && r.status === 'aman') return false;
                if (principal !== '__all__' && r.principal !== principal) return false;
                if (!term) return true;
                return (r.ref + ' ' + (r.label ?? '') + ' ' + (r.principal ?? '')).toLowerCase().includes(term);
            }),
        [list, onlyIssue, principal, term],
    );

    // Kembali ke halaman 1 tiap kali filter berubah.
    useEffect(() => setPage(1), [q, onlyIssue, principal]);

    const lastPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const current = Math.min(page, lastPage);
    const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <CardTitle className="text-base">Stok Saat Ini</CardTitle>
                        <p className="text-xs text-muted-foreground">Snapshot ERP terakhir + titik pesan ulang (buffer). Termasuk item habis (qty 0).</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={principal} onValueChange={setPrincipal}>
                            <SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">Semua principal</SelectItem>
                                {principals.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button size="sm" variant={onlyIssue ? 'default' : 'outline'} className="h-8" onClick={() => setOnlyIssue((v) => !v)} title="Tampilkan hanya yang Habis & Menipis">
                            Perlu Restock
                        </Button>
                        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode / item / principal…" className="h-8 w-56" />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto rounded-md border">
                    <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Kode</TableHead>
                                <TableHead>Item</TableHead>
                                <TableHead>Principal</TableHead>
                                <TableHead className="text-right">Stok</TableHead>
                                <TableHead className="text-right">Buffer</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {shown.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Tidak ada item.</TableCell></TableRow>
                            ) : shown.map((r) => {
                                const st = STATUS_STYLE[r.status];
                                return (
                                    <TableRow key={r.ref}>
                                        <TableCell className="font-mono whitespace-nowrap">{r.ref}</TableCell>
                                        <TableCell className="max-w-[280px] truncate" title={`${r.label ?? ''}${r.category ? ` · ${r.category}` : ''}`}>{r.label}</TableCell>
                                        <TableCell className="max-w-[160px] truncate text-muted-foreground" title={r.principal ?? ''}>{r.principal}</TableCell>
                                        <TableCell className={`text-right font-semibold tabular-nums ${r.status === 'habis' ? 'text-red-600 dark:text-red-400' : r.status === 'menipis' ? 'text-amber-600 dark:text-amber-400' : ''}`}>{num(r.qty)}</TableCell>
                                        <TableCell className="text-right tabular-nums text-muted-foreground">{r.buffer > 0 ? num(r.buffer) : '–'}</TableCell>
                                        <TableCell><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span></TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                        {rows.length === 0 ? '0 item' : `${num((current - 1) * PAGE_SIZE + 1)}–${num(Math.min(current * PAGE_SIZE, rows.length))} dari ${num(rows.length)} item`}
                        {rows.length !== list.length && ` (difilter dari ${num(list.length)})`}
                    </span>
                    {lastPage > 1 && (
                        <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" className="h-7 px-2" disabled={current <= 1} onClick={() => setPage(current - 1)}>Sebelumnya</Button>
                            <span className="px-1">Hal {current} / {lastPage}</span>
                            <Button variant="outline" size="sm" className="h-7 px-2" disabled={current >= lastPage} onClick={() => setPage(current + 1)}>Berikutnya</Button>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

export default function Stock({ view, dead, hasStock, stok, gudang }: Props) {
    const [drill, setDrill] = useState<StockDrill | null>(null);
    const go = (params: Record<string, string>) => router.get(route('dashboard.stock'), params, { preserveState: true, preserveScroll: true, replace: true });
    const drillStok = (kind: StockDrill['kind']) => setDrill({ kind, dead });
    const drillGudang = (kind: StockDrill['kind']) => gudang && setDrill({ kind, from: gudang.from, to: gudang.to });
    // Drill sebuah sel di tabel bulanan: batasi rentangnya ke bulan itu saja.
    const drillBulan = (kind: StockDrill['kind'], period: string) => {
        const [y, m] = period.split('-').map(Number);
        const akhir = new Date(y, m, 0).getDate();
        setDrill({ kind, from: `${period}-01`, to: `${period}-${String(akhir).padStart(2, '0')}` });
    };

    return (
        <DashboardLayout breadcrumbs={breadcrumbs}>
            <Head title="Warehouse" />
            <div className="flex flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-2xl font-semibold">Warehouse</h1>
                        <p className="text-sm text-muted-foreground">
                            Persediaan dari snapshot ERP, dan aktivitas pengiriman gudang untuk tindakan medis.
                        </p>
                    </div>
                    <div className="flex rounded-md border p-0.5">
                        {VIEWS.map((v) => (
                            <Button key={v.key} size="sm" variant={view === v.key ? 'default' : 'ghost'} className="h-7 px-2.5" onClick={() => go({ view: v.key })}>
                                {v.label}
                            </Button>
                        ))}
                    </div>
                </div>

                {!hasStock ? (
                    <Card>
                        <CardContent className="flex h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                            <p>Belum ada snapshot stok.</p>
                            <p className="text-sm">Jalankan sinkronisasi ERP, atau isi riwayat dengan <span className="font-mono text-xs">php artisan dwh:backfill-stock</span>.</p>
                        </CardContent>
                    </Card>
                ) : view === 'gudang' && gudang ? (
                    <>
                        <Card>
                            <CardContent className="flex flex-wrap items-end gap-3 p-4">
                                <div className="grid gap-1">
                                    <Label className="text-xs">Tanggal tindakan dari</Label>
                                    <Input type="date" className="h-8 w-40" defaultValue={gudang.from}
                                        onChange={(e) => e.target.value && go({ view: 'gudang', from: e.target.value, to: gudang.to })} />
                                </div>
                                <div className="grid gap-1">
                                    <Label className="text-xs">sampai</Label>
                                    <Input type="date" className="h-8 w-40" defaultValue={gudang.to}
                                        onChange={(e) => e.target.value && go({ view: 'gudang', from: gudang.from, to: e.target.value })} />
                                </div>
                                <p className="pb-1.5 text-xs text-muted-foreground">
                                    Data tersedia {fmtDate(gudang.range.min)} – {fmtDate(gudang.range.max)}. Basis waktu = tanggal tindakan.
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="border-sky-200 dark:border-sky-900">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Truck className="size-4 text-sky-600 dark:text-sky-400" /> Ritase (Trip Kendaraan)
                                </CardTitle>
                                <p className="text-xs text-muted-foreground">
                                    <b>DO = 1 trip</b> (kirim saja) · <b>Tindakan = 2 trip</b> (kirim + penarikan alat, maks H+2). Basis tanggal kirim.
                                </p>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="grid gap-3 sm:grid-cols-4">
                                    <div className="rounded-md border bg-sky-50 p-3 dark:bg-sky-950/20">
                                        <p className="text-xs text-muted-foreground">Total Ritase</p>
                                        <p className="mt-1 text-2xl font-bold text-sky-700 dark:text-sky-400">{num(gudang.ritase.total)}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">trip kendaraan</p>
                                    </div>
                                    <div
                                        className="cursor-pointer rounded-md border p-3 transition-colors hover:bg-accent/40"
                                        onClick={() => drillGudang('rit_do')}
                                        title="Klik untuk lihat daftar DO-nya"
                                    >
                                        <p className="text-xs text-muted-foreground">Dari DO</p>
                                        <p className="mt-1 text-xl font-bold">{num(gudang.ritase.ritDo)}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{num(gudang.ritase.do)} DO × 1 trip</p>
                                    </div>
                                    <div
                                        className="cursor-pointer rounded-md border p-3 transition-colors hover:bg-accent/40"
                                        onClick={() => drillGudang('rit_tindakan')}
                                        title="Klik untuk lihat daftar tindakannya"
                                    >
                                        <p className="text-xs text-muted-foreground">Dari Tindakan</p>
                                        <p className="mt-1 text-xl font-bold">{num(gudang.ritase.ritTindakan)}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{num(gudang.ritase.tindakan)} tindakan × 2 trip · {gudang.ritase.porsiTindakan}% dari total</p>
                                    </div>
                                    <div
                                        className="cursor-pointer rounded-md border border-amber-300 p-3 transition-colors hover:bg-accent/40 dark:border-amber-800"
                                        onClick={() => drillGudang('rit_menunggu')}
                                        title="Klik untuk lihat tindakan mana yang alatnya belum ditarik"
                                    >
                                        <p className="text-xs text-muted-foreground">Penarikan Menunggu</p>
                                        <p className="mt-1 text-xl font-bold text-amber-600 dark:text-amber-400">{num(gudang.ritase.menungguTarik)}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">trip yang belum terjadi (sudah dihitung di total)</p>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Bulan Kirim</TableHead>
                                                <TableHead className="text-right">DO</TableHead>
                                                <TableHead className="text-right">Trip DO</TableHead>
                                                <TableHead className="text-right">Tindakan</TableHead>
                                                <TableHead className="text-right">Trip Tindakan</TableHead>
                                                <TableHead className="text-right">RITASE</TableHead>
                                                <TableHead className="text-right">Menunggu Tarik</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {gudang.ritaseByMonth.length === 0 ? (
                                                <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Belum ada data.</TableCell></TableRow>
                                            ) : gudang.ritaseByMonth.map((m) => (
                                                <TableRow key={m.period}>
                                                    <TableCell className="font-medium">{fmtP(m.period)}</TableCell>
                                                    <TableCell className="cursor-pointer text-right tabular-nums text-muted-foreground hover:text-foreground hover:underline" onClick={() => drillBulan('rit_do', m.period)} title="Lihat DO bulan ini">{num(m.do)}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{num(m.ritDo)}</TableCell>
                                                    <TableCell className="cursor-pointer text-right tabular-nums text-muted-foreground hover:text-foreground hover:underline" onClick={() => drillBulan('rit_tindakan', m.period)} title="Lihat tindakan bulan ini">{num(m.tindakan)}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{num(m.ritTindakan)}</TableCell>
                                                    <TableCell className="text-right font-bold tabular-nums text-sky-700 dark:text-sky-400">{num(m.ritase)}</TableCell>
                                                    <TableCell
                                                        className={`text-right tabular-nums text-amber-600 dark:text-amber-400 ${m.menungguTarik ? 'cursor-pointer hover:underline' : ''}`}
                                                        onClick={m.menungguTarik ? () => drillBulan('rit_menunggu', m.period) : undefined}
                                                        title={m.menungguTarik ? 'Lihat penarikan yang menunggu' : undefined}
                                                    >
                                                        {m.menungguTarik ? num(m.menungguTarik) : '–'}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    "Menunggu tarik" = tindakan sudah dikirim tapi alatnya belum ditarik (status belum selesai). Tripnya sudah ikut dihitung karena
                                    penarikan pasti terjadi — angkanya menunjukkan beban trip yang masih tertunggak.
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Jumlah Pengiriman per Bulan</CardTitle>
                                <p className="text-xs text-muted-foreground">
                                    Dihitung dari surat jalan, <b>basis tanggal kirim</b> (rata-rata ±7 hari sebelum tindakan) — bukan tanggal tindakan seperti
                                    angka pemakaian di atas.
                                </p>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <div className="cursor-pointer rounded-md border p-3 transition-colors hover:bg-accent/40" onClick={() => drillGudang('ship')} title="Klik untuk lihat daftar pengirimannya">
                                        <p className="text-xs text-muted-foreground">Total Surat Jalan</p>
                                        <p className="mt-1 text-xl font-bold">{num(gudang.kirim.sj)}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{num(gudang.kirim.tindakan)} tindakan · {gudang.kirim.rs} rumah sakit</p>
                                    </div>
                                    <div className="cursor-pointer rounded-md border border-amber-300 p-3 transition-colors hover:bg-accent/40 dark:border-amber-800" onClick={() => drillGudang('ship_nolapor')} title="Klik untuk lihat pengiriman yang belum ada usage report">
                                        <p className="text-xs text-muted-foreground">Belum Ada Usage Report</p>
                                        <p className="mt-1 text-xl font-bold text-amber-600 dark:text-amber-400">{num(gudang.kirim.belumLapor)}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {gudang.kirim.tindakan > 0 ? Math.round((gudang.kirim.belumLapor / gudang.kirim.tindakan) * 100) : 0}% pengiriman belum dilaporkan pemakaiannya
                                        </p>
                                    </div>
                                    <div className="cursor-pointer rounded-md border p-3 transition-colors hover:bg-accent/40" onClick={() => drillGudang('ship_nosj')} title="Klik untuk lihat pengiriman tanpa nomor SJ">
                                        <p className="text-xs text-muted-foreground">Tanpa Surat Jalan</p>
                                        <p className="mt-1 text-xl font-bold">{num(gudang.kirim.tanpaSj)}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">tindakan terkirim tanpa nomor SJ</p>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Bulan Kirim</TableHead>
                                                <TableHead className="text-right">Surat Jalan</TableHead>
                                                <TableHead className="text-right">Tindakan</TableHead>
                                                <TableHead className="text-right">Rumah Sakit</TableHead>
                                                <TableHead className="text-right">Belum Lapor</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {gudang.kirimByMonth.length === 0 ? (
                                                <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Belum ada pengiriman pada rentang ini.</TableCell></TableRow>
                                            ) : gudang.kirimByMonth.map((m) => {
                                                const pct = m.tindakan > 0 ? Math.round((m.belumLapor / m.tindakan) * 100) : 0;
                                                return (
                                                    <TableRow key={m.period}>
                                                        <TableCell className="font-medium">{fmtP(m.period)}</TableCell>
                                                        <TableCell className="cursor-pointer text-right font-semibold tabular-nums hover:underline" onClick={() => drillBulan('ship', m.period)} title="Lihat pengiriman bulan ini">{num(m.sj)}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-muted-foreground">{num(m.tindakan)}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-muted-foreground">{m.rs}</TableCell>
                                                        <TableCell
                                                            className={`text-right tabular-nums ${pct >= 40 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-muted-foreground'} ${m.belumLapor > 0 ? 'cursor-pointer hover:underline' : ''}`}
                                                            onClick={m.belumLapor > 0 ? () => drillBulan('ship_nolapor', m.period) : undefined}
                                                            title={m.belumLapor > 0 ? 'Lihat pengiriman yang belum lapor' : undefined}
                                                        >
                                                            {num(m.belumLapor)} {m.belumLapor > 0 && <span className="text-[10px]">({pct}%)</span>}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    "Belum lapor" = sudah dikirim tapi belum ada usage report. Selama belum dilaporkan, pemakaiannya belum terhitung — jadi angka
                                    terpakai &amp; hit-rate di atas hanya mencakup pengiriman yang sudah dilaporkan.
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Unit Item: Dikirim vs Terpakai per Bulan</CardTitle>
                                <p className="text-xs text-muted-foreground">Kuantitas unit item — basis tanggal tindakan, hanya pengiriman yang sudah ada usage report-nya.</p>
                            </CardHeader>
                            <CardContent>
                                <Bars data={gudang.byMonth.map((m) => ({ period: m.period, a: m.sent, b: m.used }))} labelA="Unit dikirim" labelB="Unit terpakai" colorA="bg-muted-foreground/40" colorB="bg-emerald-500" onBar={(p) => drillBulan('sent', p)} />
                            </CardContent>
                        </Card>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Beban Angkut per Rumah Sakit</CardTitle>
                                    <p className="text-xs text-muted-foreground">Urut dari yang paling banyak menuntut angkutan.</p>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto">
                                        <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Rumah Sakit</TableHead>
                                                    <TableHead className="text-right">Kasus</TableHead>
                                                    <TableHead className="text-right">Dikirim</TableHead>
                                                    <TableHead className="text-right">Terpakai</TableHead>
                                                    <TableHead className="text-right">Hit</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {gudang.byHospital.map((h) => (
                                                    <TableRow key={h.rs} className="cursor-pointer hover:bg-accent/50" onClick={() => setDrill({ kind: "detail", from: gudang.from, to: gudang.to, rs: h.rs })} title="Klik untuk lihat tindakannya">
                                                        <TableCell className="max-w-[200px] truncate" title={h.rs}>{h.rs}</TableCell>
                                                        <TableCell className="text-right tabular-nums">{h.kasus}</TableCell>
                                                        <TableCell className="text-right tabular-nums">{num(h.sent)}</TableCell>
                                                        <TableCell className="text-right tabular-nums">{num(h.used)}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-muted-foreground">{h.hitRate ?? '–'}%</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-red-200 dark:border-red-900">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <PackageX className="size-4 text-red-600 dark:text-red-400" /> Beban Mati di Kit
                                    </CardTitle>
                                    <p className="text-xs text-muted-foreground">Ikut diangkut berkali-kali, <b>tak pernah sekali pun terpakai</b> — kandidat dikeluarkan dari kit.</p>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto">
                                        <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Kode</TableHead>
                                                    <TableHead>Item</TableHead>
                                                    <TableHead className="text-right">Diangkut</TableHead>
                                                    <TableHead className="text-right">Kasus</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {gudang.deadWeight.length === 0 ? (
                                                    <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Tidak ada.</TableCell></TableRow>
                                                ) : gudang.deadWeight.map((d) => (
                                                    <TableRow key={d.ref} className="cursor-pointer hover:bg-accent/50" onClick={() => setDrill({ kind: "detail", from: gudang.from, to: gudang.to, ref: d.ref })} title="Klik untuk lihat tindakannya">
                                                        <TableCell className="font-mono whitespace-nowrap">{d.ref}</TableCell>
                                                        <TableCell className="max-w-[200px] truncate" title={d.label}>{d.label}</TableCell>
                                                        <TableCell className="text-right font-semibold tabular-nums text-red-600 dark:text-red-400">{num(d.sent)}</TableCell>
                                                        <TableCell className="text-right tabular-nums">{d.kasus}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Item Paling Terpakai</CardTitle>
                                <p className="text-xs text-muted-foreground">Fast moving sesungguhnya — berdasarkan yang <b>terpakai</b>, bukan sekadar terangkut.</p>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-8 text-right">#</TableHead>
                                                <TableHead>Kode</TableHead>
                                                <TableHead>Item</TableHead>
                                                <TableHead className="text-right">Terpakai</TableHead>
                                                <TableHead className="text-right">Diangkut</TableHead>
                                                <TableHead className="text-right">Hit-rate</TableHead>
                                                <TableHead className="text-right">Kasus</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {gudang.topUsed.map((t, i) => (
                                                <TableRow key={t.ref} className="cursor-pointer hover:bg-accent/50" onClick={() => setDrill({ kind: "detail", from: gudang.from, to: gudang.to, ref: t.ref })} title="Klik untuk lihat tindakannya">
                                                    <TableCell className="text-right text-muted-foreground">{i + 1}</TableCell>
                                                    <TableCell className="font-mono whitespace-nowrap">{t.ref}</TableCell>
                                                    <TableCell className="max-w-[280px] truncate" title={t.label}>{t.label}</TableCell>
                                                    <TableCell className="text-right font-semibold tabular-nums">{num(t.used)}</TableCell>
                                                    <TableCell className="text-right tabular-nums text-muted-foreground">{num(t.sent)}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{t.hitRate ?? '–'}%</TableCell>
                                                    <TableCell className="text-right tabular-nums">{t.kasus}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </>
                ) : stok ? (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Kpi label="SKU Bergerak" value={num(stok.kpi.sku)} sub={`${num(stok.kpi.bersaldo)} bersaldo · total ${num(stok.kpi.qtyTotal)} unit`} onClick={() => drillStok('sku')} />
                            <Kpi label="Stok Menipis" value={num(stok.kpi.low)} tone="warn" sub="di bawah titik pesan ulang" onClick={() => drillStok('low')} />
                            <Kpi label={`Stok Mati (>${dead} hari)`} value={num(stok.kpi.dead)} tone="bad" sub="bersaldo tapi lama tak terjual" onClick={() => drillStok('dead')} />
                            <Kpi label="Stok Habis" value={num(stok.kpi.habis)} sub="pernah bergerak, kini nol" onClick={() => drillStok('habis')} />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground">Ambang stok mati:</span>
                            <Select value={String(dead)} onValueChange={(v) => go({ view: 'persediaan', dead: v })}>
                                <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {[90, 180, 365].map((d) => <SelectItem key={d} value={String(d)}>{d} hari</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <span className="text-xs text-muted-foreground">
                                Snapshot {fmtDate(stok.snapshotDate)} · {stok.snapshotDates} tanggal riwayat tersimpan
                            </span>
                        </div>

                        <StockNow list={stok.list} />

                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card className="border-amber-200 dark:border-amber-900">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" /> Stok Menipis
                                    </CardTitle>
                                    <p className="text-xs text-muted-foreground">Saldo di bawah titik pesan ulang (buffer), urut dari kekurangan terbesar.</p>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto">
                                        <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Kode</TableHead>
                                                    <TableHead>Item</TableHead>
                                                    <TableHead className="text-right">Stok</TableHead>
                                                    <TableHead className="text-right">Buffer</TableHead>
                                                    <TableHead className="text-right">Kurang</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {stok.lowStock.length === 0 ? (
                                                    <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Tidak ada yang di bawah buffer.</TableCell></TableRow>
                                                ) : stok.lowStock.map((r) => (
                                                    <TableRow key={r.ref}>
                                                        <TableCell className="font-mono whitespace-nowrap">{r.ref}</TableCell>
                                                        <TableCell className="max-w-[180px] truncate" title={`${r.label}${r.principal ? ` · ${r.principal}` : ''}`}>{r.label}</TableCell>
                                                        <TableCell className="text-right tabular-nums">{num(r.qty)}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-muted-foreground">{num(r.buffer ?? 0)}</TableCell>
                                                        <TableCell className="text-right font-semibold tabular-nums text-amber-600 dark:text-amber-400">{num(r.kurang ?? 0)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-red-200 dark:border-red-900">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <PackageX className="size-4 text-red-600 dark:text-red-400" /> Stok Mati / Lambat
                                    </CardTitle>
                                    <p className="text-xs text-muted-foreground">Punya saldo tapi tak terjual &gt;{dead} hari — urut dari kuantitas terbesar.</p>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto">
                                        <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Kode</TableHead>
                                                    <TableHead>Item</TableHead>
                                                    <TableHead className="text-right">Stok</TableHead>
                                                    <TableHead>Terakhir Terjual</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {stok.deadStock.length === 0 ? (
                                                    <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Tidak ada.</TableCell></TableRow>
                                                ) : stok.deadStock.map((r) => (
                                                    <TableRow key={r.ref}>
                                                        <TableCell className="font-mono whitespace-nowrap">{r.ref}</TableCell>
                                                        <TableCell className="max-w-[180px] truncate" title={`${r.label}${r.principal ? ` · ${r.principal}` : ''}`}>{r.label}</TableCell>
                                                        <TableCell className="text-right font-semibold tabular-nums">{num(r.qty)}</TableCell>
                                                        <TableCell className="whitespace-nowrap text-muted-foreground">
                                                            {r.lastSold ? <>{fmtDate(r.lastSold)} <span className="text-[10px]">({num(r.umur ?? 0)} hr)</span></> : <span className="italic">tak pernah terjual</span>}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader className="pb-2">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <CardTitle className="text-base">Mutasi Stok per Bulan</CardTitle>
                                        <p className="text-xs text-muted-foreground">
                                            Kuantitas masuk vs keluar dari pergerakan stok ERP (Dolibarr).
                                            {stok.movementMeta.from && <> {fmtP(stok.movementMeta.from)} – {fmtP(stok.movementMeta.to ?? stok.movementMeta.from)} · {num(stok.movementMeta.rows)} pergerakan.</>}
                                        </p>
                                    </div>
                                    <Select
                                        value={stok.movementMeta.year ? String(stok.movementMeta.year) : '__last__'}
                                        onValueChange={(v) => go({ view: 'persediaan', dead: String(dead), ...(v === '__last__' ? {} : { movyear: v }) })}
                                    >
                                        <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__last__">12 bulan terakhir</SelectItem>
                                            {stok.movementMeta.years.map((y) => <SelectItem key={y} value={String(y)}>Tahun {y}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {stok.movement.length === 0 ? (
                                    <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada pergerakan pada periode ini.</p>
                                ) : (
                                    <Bars data={stok.movement.map((m) => ({ period: m.period, a: m.masuk, b: m.keluar }))} labelA="Masuk" labelB="Keluar" colorA="bg-emerald-500" colorB="bg-red-400" onBar={(p) => setDrill({ kind: 'mov', period: p })} />
                                )}
                            </CardContent>
                        </Card>

                        <p className="text-[11px] text-muted-foreground">
                            Nilai persediaan dalam rupiah <b>belum ditampilkan</b>: harga di Accurate adalah harga jual, bukan harga pokok. HPP dari faktur pembelian
                            belum dibangun — lebih baik tidak menampilkan angka daripada menampilkan yang salah.
                        </p>
                    </>
                ) : null}
            </div>

            <StockDrilldownDialog drill={drill} onClose={() => setDrill(null)} />
        </DashboardLayout>
    );
}
