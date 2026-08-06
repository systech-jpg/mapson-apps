import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Dua level: daftar akun penyusun satu baris P&L (`types`), lalu transaksi satu akun (`account`). */
export interface GlDrill {
    period: string;
    types?: string;
    label?: string;
    account?: string;
}

interface AccountRow { code: string; name: string | null; group: string | null; rows: number; value: number }
interface TrxRow { trx_type: string | null; doc_no: string | null; description: string | null; debit: number; credit: number; amount: number }

interface Payload {
    mode?: string;
    period: string;
    label?: string;
    account?: { code: string; name: string | null; type: string | null; parent: string | null };
    summary: { accounts?: number; rows: number; total?: number; debit?: number; credit?: number; net?: number };
    byType?: { trx_type: string; n: number; net: number }[];
    accounts?: AccountRow[];
    rows?: TrxRow[];
}

const rp = (n: number) => Math.round(Number(n || 0)).toLocaleString('id-ID');
const rpC = (n: number) => {
    const x = Number(n || 0);
    const s = x < 0 ? '-' : '';
    const a = Math.abs(x);
    if (a >= 1e9) return s + 'Rp ' + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (a >= 1e6) return s + 'Rp ' + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return s + 'Rp ' + a.toLocaleString('id-ID');
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtPeriod = (p: string) => {
    const [y, m] = p.split('-');
    return `${MONTHS[Number(m) - 1]} ${y}`;
};

export function GlDrilldownDialog({ drill, onClose }: { drill: GlDrill | null; onClose: () => void }) {
    // `view` = level yang sedang dibuka; `root` = titik masuk, untuk tombol kembali.
    const [view, setView] = useState<GlDrill | null>(drill);
    const [data, setData] = useState<Payload | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => setView(drill), [drill]);

    const key = view ? `${view.period}|${view.types ?? ''}|${view.account ?? ''}` : '';

    useEffect(() => {
        if (!view) return;
        const ac = new AbortController();
        setLoading(true);
        setData(null);
        const p = new URLSearchParams({ period: view.period });
        if (view.account) p.set('account', view.account);
        else if (view.types) {
            p.set('types', view.types);
            if (view.label) p.set('label', view.label);
        }
        fetch(`${route('dashboard.cost.drilldown')}?${p}`, {
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

    const isAccounts = data?.mode === 'accounts';
    // Tombol kembali hanya bila kita masuk lewat daftar akun, lalu turun ke satu akun.
    const bisaKembali = !!(drill?.types && view?.account);
    const maxVal = isAccounts ? Math.max(...(data?.accounts ?? []).map((a) => Math.abs(a.value)), 1) : 1;

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
                        {!data ? 'Memuat…' : isAccounts ? data.label : `${data.account?.code} — ${data.account?.name}`}
                    </DialogTitle>
                    <DialogDescription className="break-words">
                        {!data ? (
                            'Mengambil data buku besar…'
                        ) : isAccounts ? (
                            <>
                                {fmtPeriod(data.period)} · {data.summary.accounts} akun · {data.summary.rows} transaksi ·{' '}
                                <b className="text-foreground">Total {rpC(data.summary.total ?? 0)}</b> — klik baris untuk lihat transaksinya
                            </>
                        ) : (
                            <>
                                {fmtPeriod(data.period)} · {data.summary.rows} transaksi · Debit {rpC(data.summary.debit ?? 0)} · Kredit{' '}
                                {rpC(data.summary.credit ?? 0)} · <b className="text-foreground">Bersih {rpC(data.summary.net ?? 0)}</b>
                                {data.account?.parent && <> · grup {data.account.parent}</>}
                            </>
                        )}
                    </DialogDescription>
                </DialogHeader>

                {data && !isAccounts && (data.byType?.length ?? 0) > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                        {data.byType?.map((t) => (
                            <Badge key={t.trx_type} variant="secondary" className="font-normal">
                                {t.trx_type}: {t.n}× · {rpC(t.net)}
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
                        {isAccounts ? (
                            <Table className="text-xs [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8 text-right">#</TableHead>
                                        <TableHead>Kode</TableHead>
                                        <TableHead>Akun</TableHead>
                                        <TableHead>Grup</TableHead>
                                        <TableHead className="text-right">Transaksi</TableHead>
                                        <TableHead className="text-right">Nilai</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(data?.accounts ?? []).length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Tidak ada akun.</TableCell></TableRow>
                                    ) : (
                                        data?.accounts?.map((a, i) => (
                                            <TableRow
                                                key={a.code}
                                                className="cursor-pointer hover:bg-accent/50"
                                                onClick={() => setView({ period: data.period, account: a.code })}
                                                title="Klik untuk lihat transaksinya"
                                            >
                                                <TableCell className="text-right text-muted-foreground">{i + 1}</TableCell>
                                                <TableCell className="font-mono whitespace-nowrap">{a.code}</TableCell>
                                                <TableCell>
                                                    <div className="font-medium">{a.name}</div>
                                                    <div className="mt-0.5 h-1.5 w-full max-w-xs rounded bg-muted">
                                                        <div className="h-1.5 rounded bg-rose-500" style={{ width: `${(Math.abs(a.value) / maxVal) * 100}%` }} />
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">{a.group ?? '–'}</TableCell>
                                                <TableCell className="text-right tabular-nums">{a.rows}</TableCell>
                                                <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap" title={rp(a.value)}>{rpC(a.value)}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        ) : (
                            <Table className="text-xs [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="whitespace-nowrap">Tipe Transaksi</TableHead>
                                        <TableHead className="whitespace-nowrap">No. Bukti</TableHead>
                                        <TableHead>Keterangan</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">Debit</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">Kredit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(data?.rows ?? []).length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{loading ? 'Memuat…' : 'Tidak ada transaksi.'}</TableCell></TableRow>
                                    ) : (
                                        data?.rows?.map((r, i) => (
                                            <TableRow key={i}>
                                                <TableCell className="whitespace-nowrap">{r.trx_type}</TableCell>
                                                <TableCell className="font-medium whitespace-nowrap">{r.doc_no}</TableCell>
                                                <TableCell className="max-w-[420px] truncate" title={r.description ?? ''}>{r.description}</TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">{r.debit ? rp(r.debit) : '–'}</TableCell>
                                                <TableCell className="text-right tabular-nums whitespace-nowrap">{r.credit ? rp(r.credit) : '–'}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                        Sumber: laporan Histori Buku Besar Manual Import yang diunggah untuk periode ini. Cocokkan No. Bukti di Manual Import untuk menelusuri lebih jauh.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
