import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRight } from 'lucide-react';

export interface CompareRow {
    code: string;
    name: string | null;
    group: string | null;
    type: string;
    a: number;
    b: number;
    delta: number;
    pct: number | null;
}
export interface Compare {
    a: string;
    b: string;
    rows: CompareRow[];
    totals: Record<string, { a: number; b: number }>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtPeriod = (p: string) => {
    const [y, m] = p.split('-');
    return `${MONTHS[Number(m) - 1]} ${y}`;
};
const rp = (n: number) => Math.round(Number(n || 0)).toLocaleString('id-ID');
const rpC = (n: number) => {
    const x = Number(n || 0);
    const s = x < 0 ? '-' : '';
    const a = Math.abs(x);
    if (a >= 1e9) return s + 'Rp ' + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (a >= 1e6) return s + 'Rp ' + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return s + 'Rp ' + a.toLocaleString('id-ID');
};

const TYPE_LABEL: Record<string, string> = {
    REVENUE: 'Pendapatan', COGS: 'HPP', EXPENSE: 'Beban Op', OTHER_EXPENSE: 'Beban Non-Op', OTHER_INCOME: 'Pendapatan Non-Op',
};

/** Naik/turunnya beban itu buruk; naiknya pendapatan itu baik — warnai sesuai maknanya. */
const deltaTone = (r: CompareRow) => {
    const baik = ['REVENUE', 'OTHER_INCOME'].includes(r.type) ? r.delta > 0 : r.delta < 0;
    if (Math.abs(r.delta) < 1) return 'text-muted-foreground';
    return baik ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
};

export function CostCompare({
    compare, periods, onChange, onDrill,
}: {
    compare: Compare;
    periods: string[];
    onChange: (a: string, b: string) => void;
    onDrill: (period: string, account: string) => void;
}) {
    const t = compare.totals;
    const ringkas = [
        { label: 'Pendapatan', ...t.pendapatan },
        { label: 'HPP', ...t.hpp },
        { label: 'Beban (op + non-op)', ...t.beban },
    ];

    return (
        <>
            <Card>
                <CardContent className="flex flex-wrap items-end gap-3 p-4">
                    <div className="grid gap-1">
                        <span className="text-xs text-muted-foreground">Periode</span>
                        <Select value={compare.a} onValueChange={(v) => onChange(v, compare.b)}>
                            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>{periods.map((p) => <SelectItem key={p} value={p}>{fmtPeriod(p)}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <span className="pb-2 text-muted-foreground">dibandingkan dengan</span>
                    <div className="grid gap-1">
                        <span className="text-xs text-muted-foreground">Pembanding</span>
                        <Select value={compare.b} onValueChange={(v) => onChange(compare.a, v)}>
                            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>{periods.map((p) => <SelectItem key={p} value={p}>{fmtPeriod(p)}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-3">
                {ringkas.map((r) => {
                    const d = r.a - r.b;
                    const naik = d > 0;
                    return (
                        <Card key={r.label}>
                            <CardContent className="p-4">
                                <p className="text-xs text-muted-foreground">{r.label}</p>
                                <p className="mt-1 text-xl font-bold">{rpC(r.a)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    dari {rpC(r.b)} ·{' '}
                                    <span className={naik ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                                        {naik ? '+' : ''}{rpC(d)}
                                        {Math.abs(r.b) > 0.005 && ` (${naik ? '+' : ''}${((d / Math.abs(r.b)) * 100).toFixed(1)}%)`}
                                    </span>
                                </p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        {fmtPeriod(compare.b)} <ArrowRight className="size-4" /> {fmtPeriod(compare.a)}
                        <span className="text-sm font-normal text-muted-foreground">· urut dari perubahan terbesar</span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Merah = memburuk (beban naik / pendapatan turun), hijau = membaik. <b>Klik baris</b> untuk lihat transaksinya.
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-8 [&_th]:px-3">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Kode</TableHead>
                                    <TableHead>Akun</TableHead>
                                    <TableHead>Jenis</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">{fmtPeriod(compare.a)}</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">{fmtPeriod(compare.b)}</TableHead>
                                    <TableHead className="text-right">Selisih</TableHead>
                                    <TableHead className="text-right">%</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {compare.rows.length === 0 ? (
                                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Tidak ada data.</TableCell></TableRow>
                                ) : (
                                    compare.rows.map((r) => (
                                        <TableRow key={r.code} className="cursor-pointer hover:bg-accent/50" onClick={() => onDrill(compare.a, r.code)} title="Klik untuk lihat transaksinya">
                                            <TableCell className="font-mono text-xs whitespace-nowrap">{r.code}</TableCell>
                                            <TableCell>
                                                <div className="font-medium">{r.name}</div>
                                                {r.group && <div className="text-[11px] text-muted-foreground">{r.group}</div>}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{TYPE_LABEL[r.type] ?? r.type}</TableCell>
                                            <TableCell className="text-right tabular-nums whitespace-nowrap" title={rp(r.a)}>{rpC(r.a)}</TableCell>
                                            <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground" title={rp(r.b)}>{rpC(r.b)}</TableCell>
                                            <TableCell className={`text-right font-semibold tabular-nums whitespace-nowrap ${deltaTone(r)}`} title={rp(r.delta)}>
                                                {r.delta > 0 ? '+' : ''}{rpC(r.delta)}
                                            </TableCell>
                                            <TableCell className={`text-right tabular-nums whitespace-nowrap ${deltaTone(r)}`}>
                                                {r.pct === null ? <span className="text-xs text-muted-foreground italic">baru</span> : `${r.pct > 0 ? '+' : ''}${r.pct}%`}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                        "baru" = akun tidak bergerak di periode pembanding, jadi persentase tak bermakna.
                    </p>
                </CardContent>
            </Card>
        </>
    );
}
