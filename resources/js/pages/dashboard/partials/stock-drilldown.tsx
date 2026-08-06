import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

/** kind menentukan isi & urutan: persediaan (sku/low/dead/habis), gudang per item (sent/used/kembali/hit), atau detail tindakan. */
export interface StockDrill {
    kind: 'sku' | 'low' | 'dead' | 'habis' | 'sent' | 'used' | 'kembali' | 'hit' | 'detail' | 'rit_do' | 'rit_tindakan' | 'rit_menunggu' | 'ship' | 'ship_nolapor' | 'ship_nosj' | 'mov' | 'cost_sku' | 'cost_dead' | 'cost_unvalued';
    dead?: number;
    from?: string;
    to?: string;
    ref?: string;
    rs?: string;
    principal?: string;
    period?: string;
    basis?: string; // 'beli' | 'jual' — hanya untuk kind cost_*
}

interface StokRow { ref: string; label: string | null; principal: string | null; category: string | null; qty: number; buffer: number; kurang: number; lastSold: string | null; umur: number | null }
interface GudangRow { ref: string; label: string; kasus: number; sent: number; used: number; kembali: number; hitRate: number | null }
interface DetailRow { tindakan: string; tanggal: string | null; rs: string; sj: string; delivery: string | null; jenis: string; pasien: string | null; dokter: string | null; ref: string; label: string; sent: number; used: number }
interface RitaseRow { jenis: string; ref: string; tanggal: string | null; tanggalTindakan?: string | null; sj?: string; rs: string; status: number; statusLabel: string; trip: number; menunggu: boolean }
interface ShipRow { ref: string; tanggal: string | null; tanggalTindakan: string | null; sj: string; rs: string; status: number; belumLapor: boolean }
interface MovRow { ref: string; label: string; masuk: number; keluar: number; net: number; baris: number }
interface MovType { type: number; label: string; baris: number; masuk: number; keluar: number }
interface CostRow { ref: string; label: string | null; principal: string | null; qty: number; hpp: number; nilai: number; lastSold: string | null; umur: number | null }

interface Payload {
    mode: 'stok' | 'gudang' | 'detail' | 'ritase' | 'ship' | 'mov' | 'cost';
    title: string;
    period?: string;
    sensitive?: boolean;
    truncated?: boolean;
    byType?: MovType[];
    summary: { rows: number; total?: number; truncated?: boolean; qty?: number; nilai?: number; sent?: number; used?: number; kembali?: number; kasus?: number; trip?: number; menunggu?: number; items?: number; baris?: number; masuk?: number; keluar?: number };
    rows: (StokRow | GudangRow | DetailRow | RitaseRow | ShipRow | MovRow | CostRow)[];
}

const num = (n: number) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
const rp = (n: number) => 'Rp ' + Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : null);

export function StockDrilldownDialog({ drill, onClose }: { drill: StockDrill | null; onClose: () => void }) {
    // `view` = level yang sedang dibuka; `drill` = titik masuk, untuk tombol kembali.
    const [view, setView] = useState<StockDrill | null>(drill);
    const [data, setData] = useState<Payload | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => setView(drill), [drill]);

    const key = view ? `${view.kind}|${view.dead ?? ''}|${view.from ?? ''}|${view.to ?? ''}|${view.ref ?? ''}|${view.rs ?? ''}|${view.principal ?? ''}|${view.period ?? ''}|${view.basis ?? ''}` : '';

    useEffect(() => {
        if (!view) return;
        const drill = view;
        const ac = new AbortController();
        setLoading(true);
        setData(null);
        const p = new URLSearchParams({ kind: drill.kind });
        if (drill.dead) p.set('dead', String(drill.dead));
        if (drill.from) p.set('from', drill.from);
        if (drill.to) p.set('to', drill.to);
        if (drill.ref) p.set('ref', drill.ref);
        if (drill.rs) p.set('rs', drill.rs);
        if (drill.principal) p.set('principal', drill.principal);
        if (drill.period) p.set('period', drill.period);
        if (drill.basis) p.set('basis', drill.basis);
        fetch(`${route('dashboard.stock.drilldown')}?${p}`, {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
            signal: ac.signal,
        })
            .then((r) => r.json())
            .then((j: Payload) => setData(j))
            .catch(() => {})
            .finally(() => setLoading(false));
        return () => ac.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const stok = data?.mode === 'stok';
    const detail = data?.mode === 'detail';
    const ritase = data?.mode === 'ritase';
    const ship = data?.mode === 'ship';
    const mov = data?.mode === 'mov';
    const costMode = data?.mode === 'cost';
    // Bisa kembali hanya bila kita turun dari daftar item ke detail tindakan.
    const bisaKembali = !!(drill && drill.kind !== 'detail' && view?.kind === 'detail');
    const openDetail = (ref?: string, rs?: string) =>
        view && setView({ kind: 'detail', from: view.from, to: view.to, ref, rs });

    return (
        <Dialog open={!!drill} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92vh] w-[96vw] max-w-6xl gap-3 overflow-y-auto p-4 sm:p-6">
                <DialogHeader className="pr-8 text-left">
                    <DialogTitle className="flex flex-wrap items-center gap-2 text-base break-words sm:text-lg">
                        {bisaKembali && (
                            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => setView(drill)}>
                                <ChevronLeft className="size-4" /> Kembali
                            </Button>
                        )}
                        {data?.title ?? 'Memuat…'}
                    </DialogTitle>
                    <DialogDescription className="break-words">
                        {!data ? (
                            'Mengambil data…'
                        ) : mov ? (
                            <>
                                {data.period} · {num(data.summary.items ?? 0)} item · masuk {num(data.summary.masuk ?? 0)} · keluar {num(data.summary.keluar ?? 0)} ·{' '}
                                <b className="text-foreground">{num(data.summary.baris ?? 0)} pergerakan</b>
                            </>
                        ) : ship ? (
                            <>
                                {num(data.summary.rows)} pengiriman
                                {(data.summary.menunggu ?? 0) > 0 && (
                                    <span className="text-amber-600 dark:text-amber-400"> · {num(data.summary.menunggu ?? 0)} belum ada usage report</span>
                                )}
                            </>
                        ) : ritase ? (
                            <>
                                {num(data.summary.rows)} dokumen · <b className="text-foreground">{num(data.summary.trip ?? 0)} trip</b>
                                {(data.summary.menunggu ?? 0) > 0 && (
                                    <span className="text-amber-600 dark:text-amber-400"> · {num(data.summary.menunggu ?? 0)} alat belum ditarik</span>
                                )}
                            </>
                        ) : detail ? (
                            <>
                                {num(data.summary.kasus ?? 0)} tindakan · diangkut {num(data.summary.sent ?? 0)} · terpakai {num(data.summary.used ?? 0)} ·{' '}
                                <b className="text-foreground">kembali {num(data.summary.kembali ?? 0)}</b>
                                {data.sensitive === false && <span className="text-muted-foreground"> · nama pasien &amp; dokter disembunyikan sesuai izin Anda</span>}
                            </>
                        ) : costMode ? (
                            <>
                                {num(data.summary.total ?? data.summary.rows)} item · total {num(data.summary.qty ?? 0)} unit ·{' '}
                                <b className="text-foreground">nilai {rp(data.summary.nilai ?? 0)}</b>
                                {data.summary.truncated && (
                                    <span className="text-amber-600 dark:text-amber-400"> · menampilkan {num(data.summary.rows)} teratas</span>
                                )}
                            </>
                        ) : stok ? (
                            <>
                                {num(data.summary.total ?? data.summary.rows)} item · total {num(data.summary.qty ?? 0)} unit
                                {data.summary.truncated && (
                                    <span className="text-amber-600 dark:text-amber-400"> · menampilkan {num(data.summary.rows)} teratas</span>
                                )}
                            </>
                        ) : (
                            <>
                                {num(data.summary.rows)} item · diangkut {num(data.summary.sent ?? 0)} · terpakai {num(data.summary.used ?? 0)} ·{' '}
                                <b className="text-foreground">kembali {num(data.summary.kembali ?? 0)}</b>
                            </>
                        )}
                    </DialogDescription>
                </DialogHeader>

                {mov && (data?.byType?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {data?.byType?.map((t) => (
                            <Badge key={t.type} variant="secondary" className="font-normal">
                                {t.label}: {num(t.baris)}× · <span className="ml-1 text-emerald-600 dark:text-emerald-400">+{num(t.masuk)}</span>&nbsp;/&nbsp;<span className="text-red-600 dark:text-red-400">−{num(t.keluar)}</span>
                            </Badge>
                        ))}
                    </div>
                )}

                <div className="relative">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                            <LoaderCircle className="size-5 animate-spin" />
                        </div>
                    )}
                    <div className="overflow-x-auto rounded-md border">
                        {mov ? (
                            <Table className="text-xs [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8 text-right">#</TableHead>
                                        <TableHead>Kode</TableHead>
                                        <TableHead>Item</TableHead>
                                        <TableHead className="text-right">Masuk</TableHead>
                                        <TableHead className="text-right">Keluar</TableHead>
                                        <TableHead className="text-right">Net</TableHead>
                                        <TableHead className="text-right">Pergerakan</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(data?.rows as MovRow[] | undefined)?.length === 0 ? (
                                        <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Tidak ada pergerakan.</TableCell></TableRow>
                                    ) : (
                                        (data?.rows as MovRow[] | undefined)?.map((r, i) => (
                                            <TableRow key={r.ref + i}>
                                                <TableCell className="text-right text-muted-foreground">{i + 1}</TableCell>
                                                <TableCell className="font-mono whitespace-nowrap">{r.ref}</TableCell>
                                                <TableCell className="max-w-[300px] truncate" title={r.label}>{r.label}</TableCell>
                                                <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{r.masuk ? num(r.masuk) : '–'}</TableCell>
                                                <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">{r.keluar ? num(r.keluar) : '–'}</TableCell>
                                                <TableCell className={`text-right font-semibold tabular-nums ${r.net < 0 ? 'text-red-600 dark:text-red-400' : r.net > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{r.net > 0 ? '+' : ''}{num(r.net)}</TableCell>
                                                <TableCell className="text-right tabular-nums text-muted-foreground">{r.baris}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        ) : ship ? (
                            <Table className="text-xs [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8 text-right">#</TableHead>
                                        <TableHead className="whitespace-nowrap">Tgl Kirim</TableHead>
                                        <TableHead>Tindakan</TableHead>
                                        <TableHead className="whitespace-nowrap">No. SJ</TableHead>
                                        <TableHead>Rumah Sakit / Customer</TableHead>
                                        <TableHead>Usage Report</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(data?.rows as ShipRow[] | undefined)?.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Tidak ada pengiriman.</TableCell></TableRow>
                                    ) : (
                                        (data?.rows as ShipRow[] | undefined)?.map((r, i) => (
                                            <TableRow key={`${r.ref}-${i}`}>
                                                <TableCell className="text-right text-muted-foreground">{i + 1}</TableCell>
                                                <TableCell className="whitespace-nowrap">{fmtDate(r.tanggal)}</TableCell>
                                                <TableCell className="font-medium whitespace-nowrap">{r.ref}</TableCell>
                                                <TableCell className="whitespace-nowrap">{r.sj || <span className="text-amber-600 dark:text-amber-400">—</span>}</TableCell>
                                                <TableCell className="max-w-[240px] truncate" title={r.rs}>{r.rs}</TableCell>
                                                <TableCell>
                                                    {r.belumLapor ? (
                                                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Belum</span>
                                                    ) : (
                                                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">Sudah</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        ) : ritase ? (
                            <Table className="text-xs [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8 text-right">#</TableHead>
                                        <TableHead>Jenis</TableHead>
                                        <TableHead>Nomor</TableHead>
                                        <TableHead className="whitespace-nowrap">Tgl Kirim</TableHead>
                                        <TableHead>Rumah Sakit / Customer</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Trip</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(data?.rows as RitaseRow[] | undefined)?.length === 0 ? (
                                        <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Tidak ada dokumen.</TableCell></TableRow>
                                    ) : (
                                        (data?.rows as RitaseRow[] | undefined)?.map((r, i) => (
                                            <TableRow key={`${r.jenis}-${r.ref}-${i}`}>
                                                <TableCell className="text-right text-muted-foreground">{i + 1}</TableCell>
                                                <TableCell>
                                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${r.jenis === 'DO' ? 'bg-muted' : 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300'}`}>
                                                        {r.jenis}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="font-medium whitespace-nowrap">
                                                    {r.ref}
                                                    {r.sj && <div className="text-[10px] text-muted-foreground">SJ {r.sj}</div>}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">{fmtDate(r.tanggal)}</TableCell>
                                                <TableCell className="max-w-[220px] truncate" title={r.rs}>{r.rs}</TableCell>
                                                <TableCell className={`whitespace-nowrap text-[11px] ${r.menunggu ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                                    {r.statusLabel}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold tabular-nums">{r.trip}×</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        ) : detail ? (
                            <Table className="text-xs [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                                        <TableHead className="whitespace-nowrap">Tindakan</TableHead>
                                        <TableHead className="whitespace-nowrap">No. SJ</TableHead>
                                        <TableHead>Rumah Sakit</TableHead>
                                        <TableHead>Jenis</TableHead>
                                        {data?.sensitive && <TableHead>Pasien</TableHead>}
                                        {data?.sensitive && <TableHead>Dokter</TableHead>}
                                        <TableHead>Item</TableHead>
                                        <TableHead className="text-right">Diangkut</TableHead>
                                        <TableHead className="text-right">Terpakai</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(data?.rows as DetailRow[] | undefined)?.length === 0 ? (
                                        <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Tidak ada tindakan.</TableCell></TableRow>
                                    ) : (
                                        (data?.rows as DetailRow[] | undefined)?.map((r, i) => (
                                            <TableRow key={`${r.tindakan}-${r.ref}-${i}`}>
                                                <TableCell className="whitespace-nowrap">{fmtDate(r.tanggal)}</TableCell>
                                                <TableCell className="font-medium whitespace-nowrap">{r.tindakan}</TableCell>
                                                <TableCell className="whitespace-nowrap">{r.sj || '–'}</TableCell>
                                                <TableCell className="max-w-[180px] truncate" title={r.rs}>{r.rs}</TableCell>
                                                <TableCell className="max-w-[140px] truncate text-muted-foreground" title={r.jenis}>{r.jenis}</TableCell>
                                                {data?.sensitive && <TableCell className="max-w-[130px] truncate" title={r.pasien ?? ''}>{r.pasien}</TableCell>}
                                                {data?.sensitive && <TableCell className="max-w-[130px] truncate" title={r.dokter ?? ''}>{r.dokter}</TableCell>}
                                                <TableCell className="max-w-[200px] truncate" title={`${r.ref} — ${r.label}`}>
                                                    <span className="font-mono text-[10px] text-muted-foreground">{r.ref}</span> {r.label}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">{num(r.sent)}</TableCell>
                                                <TableCell className={`text-right font-semibold tabular-nums ${r.used === 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{num(r.used)}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        ) : costMode ? (
                            <Table className="text-xs [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8 text-right">#</TableHead>
                                        <TableHead>Kode</TableHead>
                                        <TableHead>Item</TableHead>
                                        <TableHead>Principal</TableHead>
                                        <TableHead className="text-right">Stok</TableHead>
                                        <TableHead className="text-right">Harga/unit</TableHead>
                                        <TableHead className="text-right">Nilai</TableHead>
                                        <TableHead>Terakhir Terjual</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(data?.rows as CostRow[] | undefined)?.length === 0 ? (
                                        <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Tidak ada item.</TableCell></TableRow>
                                    ) : (
                                        (data?.rows as CostRow[] | undefined)?.map((r, i) => (
                                            <TableRow key={r.ref}>
                                                <TableCell className="text-right text-muted-foreground">{i + 1}</TableCell>
                                                <TableCell className="font-mono whitespace-nowrap">{r.ref}</TableCell>
                                                <TableCell className="max-w-[240px] truncate" title={r.label ?? ''}>{r.label}</TableCell>
                                                <TableCell className="max-w-[130px] truncate text-muted-foreground" title={r.principal ?? ''}>{r.principal}</TableCell>
                                                <TableCell className="text-right tabular-nums">{num(r.qty)}</TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">
                                                    {r.hpp > 0 ? rp(r.hpp) : <span className="text-amber-600 dark:text-amber-400">tak ternilai</span>}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">{r.nilai > 0 ? rp(r.nilai) : '–'}</TableCell>
                                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                                    {r.lastSold ? <>{fmtDate(r.lastSold)} <span className="text-[10px]">({num(r.umur ?? 0)} hr)</span></> : <span className="italic">tak pernah</span>}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        ) : stok ? (
                            <Table className="text-xs [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8 text-right">#</TableHead>
                                        <TableHead>Kode</TableHead>
                                        <TableHead>Item</TableHead>
                                        <TableHead>Principal</TableHead>
                                        <TableHead className="text-right">Stok</TableHead>
                                        <TableHead className="text-right">Buffer</TableHead>
                                        <TableHead>Terakhir Terjual</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(data?.rows as StokRow[] | undefined)?.length === 0 ? (
                                        <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Tidak ada item.</TableCell></TableRow>
                                    ) : (
                                        (data?.rows as StokRow[] | undefined)?.map((r, i) => (
                                            <TableRow key={r.ref}>
                                                <TableCell className="text-right text-muted-foreground">{i + 1}</TableCell>
                                                <TableCell className="font-mono whitespace-nowrap">{r.ref}</TableCell>
                                                <TableCell className="max-w-[260px] truncate" title={r.label ?? ''}>{r.label}</TableCell>
                                                <TableCell className="max-w-[140px] truncate text-muted-foreground" title={r.principal ?? ''}>{r.principal}</TableCell>
                                                <TableCell className={`text-right font-semibold tabular-nums ${r.qty === 0 ? 'text-muted-foreground' : ''}`}>{num(r.qty)}</TableCell>
                                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                                    {r.buffer > 0 ? num(r.buffer) : '–'}
                                                    {r.buffer > 0 && r.qty < r.buffer && (
                                                        <span className="ml-1 text-amber-600 dark:text-amber-400">(-{num(r.kurang)})</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                                    {r.lastSold ? <>{fmtDate(r.lastSold)} <span className="text-[10px]">({num(r.umur ?? 0)} hr)</span></> : <span className="italic">tak pernah</span>}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        ) : (
                            <Table className="text-xs [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8 text-right">#</TableHead>
                                        <TableHead>Kode</TableHead>
                                        <TableHead>Item</TableHead>
                                        <TableHead className="text-right">Diangkut</TableHead>
                                        <TableHead className="text-right">Terpakai</TableHead>
                                        <TableHead className="text-right">Kembali</TableHead>
                                        <TableHead className="text-right">Hit-rate</TableHead>
                                        <TableHead className="text-right">Kasus</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(data?.rows as GudangRow[] | undefined)?.length === 0 ? (
                                        <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Tidak ada item.</TableCell></TableRow>
                                    ) : (
                                        (data?.rows as GudangRow[] | undefined)?.map((r, i) => (
                                            <TableRow key={r.ref} className="cursor-pointer hover:bg-accent/50" onClick={() => openDetail(r.ref)} title="Klik untuk lihat tindakan & surat jalannya">
                                                <TableCell className="text-right text-muted-foreground">{i + 1}</TableCell>
                                                <TableCell className="font-mono whitespace-nowrap">{r.ref}</TableCell>
                                                <TableCell className="max-w-[280px] truncate" title={r.label}>{r.label}</TableCell>
                                                <TableCell className="text-right tabular-nums">{num(r.sent)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{r.used ? num(r.used) : <span className="text-muted-foreground">0</span>}</TableCell>
                                                <TableCell className="text-right tabular-nums text-muted-foreground">{num(r.kembali)}</TableCell>
                                                <TableCell className={`text-right font-semibold tabular-nums ${(r.hitRate ?? 0) === 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                                                    {r.hitRate ?? '–'}%
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">{r.kasus}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                        {costMode
                            ? 'Nilai = qty snapshot ERP × harga basis terpilih (HPP: Manual Import → faktur pembelian → PMP ERP; harga jual: master ERP → rata-rata faktur penjualan). Urut nilai terbesar. Maks 500 baris.'
                            : stok
                            ? 'Sumber: snapshot stok ERP terakhir, digabung dengan riwayat penjualan penuh (sales_facts). Maks 500 baris.'
                            : mov
                              ? 'Sumber: pergerakan stok ERP (stock_mouvement Dolibarr) bulan ini. Net = masuk − keluar. Maks 500 item.'
                              : ship
                              ? 'Pengiriman = tindakan yang sudah deliver, basis tanggal kirim. "Belum" = pengiriman itu belum ada usage report-nya. Maks 500 baris.'
                              : ritase
                                ? 'DO = 1 trip (kirim saja). Tindakan = 2 trip (kirim + penarikan alat, maks H+2) — dihitung penuh meski penarikan belum terjadi. Maks 500 baris.'
                                : detail
                                ? 'Sumber: tindakan + usage report ERP. Cocokkan No. SJ / ref tindakan di ERP untuk telusur lebih jauh. Maks 300 baris.'
                                : 'Sumber: tindakan + usage report ERP pada rentang tanggal yang dipilih. Klik baris untuk lihat tindakannya. Maks 300 baris.'}
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
