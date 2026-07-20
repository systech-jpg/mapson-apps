import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

export interface MatrixRow {
    code: string;
    name: string | null;
    group: string | null;
    type: string;
    values: Record<string, number>;
    total: number;
}
export interface Matrix {
    periods: string[];
    rows: MatrixRow[];
    totals: Record<string, { per_period: Record<string, number>; total: number }>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const shortP = (p: string) => MONTHS[Number(p.split('-')[1]) - 1];
const fmtPeriod = (p: string) => {
    const [y, m] = p.split('-');
    return `${MONTHS[Number(m) - 1]} ${y}`;
};
const rp = (n: number) => Math.round(Number(n || 0)).toLocaleString('id-ID');
const nShort = (n: number) => {
    const x = Number(n || 0);
    if (Math.abs(x) < 0.5) return '–';
    const s = x < 0 ? '-' : '';
    const a = Math.abs(x);
    if (a >= 1e9) return s + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (a >= 1e6) return s + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' jt';
    return s + a.toLocaleString('id-ID', { maximumFractionDigits: 0 });
};

const TYPE_LABEL: Record<string, string> = {
    REVENUE: 'PENDAPATAN', COGS: 'BEBAN POKOK PENJUALAN', EXPENSE: 'BEBAN OPERASIONAL',
    OTHER_EXPENSE: 'BEBAN NON-OPERASIONAL', OTHER_INCOME: 'PENDAPATAN NON-OPERASIONAL',
};
const ORDER = ['REVENUE', 'COGS', 'EXPENSE', 'OTHER_EXPENSE', 'OTHER_INCOME'];

export function CostMatrix({ matrix, onDrill }: { matrix: Matrix; onDrill: (period: string, account: string) => void }) {
    const { periods, rows, totals } = matrix;

    const exportExcel = () => {
        const header = ['Kode', 'Akun', 'Grup', 'Jenis', ...periods.map(fmtPeriod), 'Total'];
        const body = rows.map((r) => [r.code, r.name, r.group, TYPE_LABEL[r.type] ?? r.type, ...periods.map((p) => r.values[p] ?? 0), r.total]);
        const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
        ws['!cols'] = [{ wch: 10 }, { wch: 34 }, { wch: 26 }, { wch: 22 }, ...periods.map(() => ({ wch: 16 })), { wch: 16 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Matriks P&L');
        XLSX.writeFile(wb, `matriks-laba-rugi-${periods[0]}_${periods[periods.length - 1]}.xlsx`);
    };

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <CardTitle className="text-base">Matriks Laba Rugi · {fmtPeriod(periods[0])} – {fmtPeriod(periods[periods.length - 1])}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            {rows.length} akun × {periods.length} periode. Nilai disingkat (jt = juta, M = miliar) — arahkan kursor untuk angka penuh.{' '}
                            <b>Klik sel</b> untuk lihat transaksinya.
                        </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={exportExcel}>
                        <FileSpreadsheet className="size-4" /> Export Excel
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                        <TableHeader>
                            <TableRow className="bg-muted/60">
                                <TableHead className="sticky left-0 z-10 min-w-[240px] bg-muted">Akun</TableHead>
                                {periods.map((p) => <TableHead key={p} className="text-right whitespace-nowrap">{shortP(p)}</TableHead>)}
                                <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {ORDER.filter((t) => rows.some((r) => r.type === t)).map((t) => (
                                <>
                                    <TableRow key={`h-${t}`} className="bg-muted/40 font-semibold">
                                        <TableCell className="sticky left-0 z-10 bg-muted/40 whitespace-nowrap">{TYPE_LABEL[t] ?? t}</TableCell>
                                        {periods.map((p) => (
                                            <TableCell key={p} className="text-right tabular-nums" title={rp(totals[t]?.per_period[p] ?? 0)}>
                                                {nShort(totals[t]?.per_period[p] ?? 0)}
                                            </TableCell>
                                        ))}
                                        <TableCell className="text-right tabular-nums" title={rp(totals[t]?.total ?? 0)}>{nShort(totals[t]?.total ?? 0)}</TableCell>
                                    </TableRow>
                                    {rows.filter((r) => r.type === t).map((r) => (
                                        <TableRow key={r.code}>
                                            <TableCell className="sticky left-0 z-10 max-w-[320px] bg-background">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-[10px] text-muted-foreground">{r.code}</span>
                                                    <span className="truncate" title={`${r.name}${r.group ? ` · ${r.group}` : ''}`}>{r.name}</span>
                                                </div>
                                            </TableCell>
                                            {periods.map((p) => {
                                                const v = r.values[p] ?? 0;
                                                return (
                                                    <TableCell
                                                        key={p}
                                                        className={`text-right tabular-nums whitespace-nowrap ${Math.abs(v) > 0.5 ? 'cursor-pointer hover:bg-accent/60' : 'text-muted-foreground/40'}`}
                                                        onClick={Math.abs(v) > 0.5 ? () => onDrill(p, r.code) : undefined}
                                                        title={Math.abs(v) > 0.5 ? `${fmtPeriod(p)}: ${rp(v)} — klik untuk detail` : undefined}
                                                    >
                                                        {nShort(v)}
                                                    </TableCell>
                                                );
                                            })}
                                            <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap" title={rp(r.total)}>{nShort(r.total)}</TableCell>
                                        </TableRow>
                                    ))}
                                </>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
