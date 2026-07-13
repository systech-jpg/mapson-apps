import { DrilldownDialog, type DrillFilter } from '@/components/drilldown-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import DashboardLayout from '@/layouts/dashboard-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, LoaderCircle, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Penjualan per Merk', href: '/dashboard/penjualan-merk' },
];

type DimKey = 'merk' | 'sales' | 'region' | 'customer' | 'produk';
type PathEntry = [DimKey, string];

interface PivotRow {
    label: string;
    months: number[];
    total: number;
    qty: number;
    invoices: number;
}

interface LevelData {
    rows: PivotRow[];
    hasChildren: boolean;
}

interface Props {
    years: string[];
    year: string;
    hasData: boolean;
}

const DIM_LABELS: Record<DimKey, string> = {
    merk: 'Merk / Principal',
    sales: 'Sales',
    region: 'Region',
    customer: 'Rumah Sakit / Customer',
    produk: 'Produk',
};

const ALL_DIMS: DimKey[] = ['merk', 'sales', 'region', 'customer', 'produk'];
const DEFAULT_DIMS: DimKey[] = ['merk', 'sales', 'region', 'customer'];
const EMPTY_LABEL = '(kosong)';
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const METRIC_LABELS: Record<string, string> = { dpp: 'DPP (net)', total: 'Total (TTC)', qty: 'Kuantitas' };

const keyOf = (path: PathEntry[]) => JSON.stringify(path);

const nShort = (n: number) => {
    const x = Number(n || 0);
    if (Math.abs(x) >= 1e9) return (x / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (Math.abs(x) >= 1e6) return (x / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return x.toLocaleString('id-ID', { maximumFractionDigits: 0 });
};
const nFull = (n: number) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });

export default function BrandAnalysis({ years, year: initialYear, hasData }: Props) {
    const [year, setYear] = useState(initialYear);
    const [metric, setMetric] = useState<'dpp' | 'total' | 'qty'>('dpp');
    const [dims, setDims] = useState<DimKey[]>(DEFAULT_DIMS);
    const [nodes, setNodes] = useState<Record<string, LevelData>>({});
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [drill, setDrill] = useState<DrillFilter | null>(null);
    const [exporting, setExporting] = useState(false);

    const dimsKey = dims.join(',');

    const fetchLevel = (path: PathEntry[], y: string, m: string, dk: string) => {
        const params = new URLSearchParams();
        params.set('year', y);
        params.set('metric', m);
        params.set('dims', dk);
        path.forEach(([d, v]) => params.set(`path[${d}]`, v));
        fetch(`${route('dashboard.brand.pivot')}?${params.toString()}`, {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
        })
            .then((r) => r.json())
            .then((json: LevelData) => setNodes((prev) => ({ ...prev, [keyOf(path)]: json })))
            .catch(() => {});
    };

    // Ganti tahun / metrik / susunan dimensi → seluruh pohon dimuat ulang dari akar.
    useEffect(() => {
        setNodes({});
        setExpanded(new Set());
        fetchLevel([], year, metric, dimsKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [year, metric, dimsKey]);

    const toggle = (rowPath: PathEntry[]) => {
        const rowKey = keyOf(rowPath);
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(rowKey)) next.delete(rowKey);
            else next.add(rowKey);
            return next;
        });
        if (!expanded.has(rowKey) && !nodes[rowKey]) fetchLevel(rowPath, year, metric, dimsKey);
    };

    const moveDim = (i: number, dir: -1 | 1) => {
        setDims((prev) => {
            const next = [...prev];
            const j = i + dir;
            if (j < 0 || j >= next.length) return prev;
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
    };
    const removeDim = (d: DimKey) => setDims((prev) => (prev.length > 1 ? prev.filter((x) => x !== d) : prev));
    const addDim = (d: DimKey) => setDims((prev) => [...prev, d]);

    const exportExcel = async () => {
        setExporting(true);
        try {
            const params = new URLSearchParams({ year, metric, dims: dimsKey });
            const res = await fetch(`${route('dashboard.brand.export')}?${params.toString()}`, {
                headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin',
            });
            const json: { rows: { dims: string[]; months: number[]; total: number; qty: number; invoices: number }[]; dims: DimKey[] } =
                await res.json();

            const header = [...json.dims.map((d) => DIM_LABELS[d]), ...MONTHS_ID, `Total ${METRIC_LABELS[metric]}`, 'Qty', 'Invoice'];
            const body = json.rows.map((r) => [...r.dims, ...r.months, r.total, r.qty, r.invoices]);
            const totals = [
                'TOTAL',
                ...Array(json.dims.length - 1).fill(''),
                ...MONTHS_ID.map((_, i) => json.rows.reduce((s, r) => s + r.months[i], 0)),
                json.rows.reduce((s, r) => s + r.total, 0),
                json.rows.reduce((s, r) => s + r.qty, 0),
                json.rows.reduce((s, r) => s + r.invoices, 0),
            ];

            const ws = XLSX.utils.aoa_to_sheet([header, ...body, totals]);
            ws['!cols'] = [
                ...json.dims.map((d) => ({ wch: d === 'customer' || d === 'produk' ? 38 : 26 })),
                ...MONTHS_ID.map(() => ({ wch: 12 })),
                { wch: 15 },
                { wch: 9 },
                { wch: 8 },
            ];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, `Penjualan ${year}`);
            XLSX.writeFile(wb, `penjualan-per-merk-${year}.xlsx`);
        } finally {
            setExporting(false);
        }
    };

    const drillFilterFor = (path: PathEntry[]): DrillFilter => {
        const f: DrillFilter = { year };
        path.forEach(([d, v]) => {
            f[d] = v;
        });
        return f;
    };

    const root = nodes[keyOf([])];
    const grandTotal = root ? root.rows.reduce((s, r) => s + r.total, 0) : 0;
    const grandMonths = root ? MONTHS_ID.map((_, i) => root.rows.reduce((s, r) => s + r.months[i], 0)) : [];
    const grandQty = root ? root.rows.reduce((s, r) => s + r.qty, 0) : 0;
    const grandInvoices = root ? root.rows.reduce((s, r) => s + r.invoices, 0) : 0;

    const COLSPAN = 17; // label + 12 bulan + total + % + qty + invoice

    const renderLevel = (path: PathEntry[], depth: number): React.ReactNode[] => {
        const node = nodes[keyOf(path)];
        if (!node) {
            return [
                <TableRow key={keyOf(path) + ':loading'}>
                    <TableCell colSpan={COLSPAN} className="py-3 text-center text-muted-foreground" style={{ paddingLeft: 12 + depth * 18 }}>
                        <LoaderCircle className="mr-1.5 inline size-3.5 animate-spin" /> memuat…
                    </TableCell>
                </TableRow>,
            ];
        }
        if (node.rows.length === 0) {
            return [
                <TableRow key={keyOf(path) + ':empty'}>
                    <TableCell colSpan={COLSPAN} className="py-3 text-muted-foreground" style={{ paddingLeft: 12 + depth * 18 }}>
                        Tidak ada data.
                    </TableCell>
                </TableRow>,
            ];
        }
        const canExpand = depth + 1 < dims.length;
        return node.rows.flatMap((row) => {
            const rowPath: PathEntry[] = [...path, [dims[depth], row.label]];
            const rowKey = keyOf(rowPath);
            const isOpen = expanded.has(rowKey);
            const drillable = !rowPath.some(([, v]) => v === EMPTY_LABEL);
            const filter = drillFilterFor(rowPath);
            const share = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0;

            const tr = (
                <TableRow key={rowKey} className={depth === 0 ? 'bg-muted/40 font-medium' : ''}>
                    <TableCell
                        className="sticky left-0 z-10 max-w-[320px] bg-background whitespace-nowrap"
                        style={{ paddingLeft: 8 + depth * 18 }}
                    >
                        <div className="flex items-center gap-1">
                            {canExpand ? (
                                <button
                                    type="button"
                                    onClick={() => toggle(rowPath)}
                                    className="rounded p-0.5 hover:bg-accent"
                                    aria-label={isOpen ? 'Tutup' : 'Buka'}
                                >
                                    {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                                </button>
                            ) : (
                                <span className="inline-block w-[18px]" />
                            )}
                            <span className="truncate" title={row.label}>
                                {row.label}
                            </span>
                            <span className="ml-1 shrink-0 rounded bg-muted px-1 text-[9px] font-normal text-muted-foreground uppercase">
                                {DIM_LABELS[dims[depth]]}
                            </span>
                        </div>
                    </TableCell>
                    {row.months.map((v, i) => (
                        <TableCell
                            key={i}
                            title={v > 0 ? `${MONTHS_ID[i]} ${year}: ${nFull(v)}${drillable ? ' — klik untuk detail' : ''}` : undefined}
                            className={`text-right whitespace-nowrap tabular-nums ${v > 0 ? '' : 'text-muted-foreground/50'} ${drillable && v > 0 ? 'cursor-pointer hover:bg-accent/60' : ''}`}
                            onClick={drillable && v > 0 ? () => setDrill({ ...filter, month: i + 1 }) : undefined}
                        >
                            {v > 0 ? nShort(v) : '–'}
                        </TableCell>
                    ))}
                    <TableCell
                        title={`Total: ${nFull(row.total)}${drillable ? ' — klik untuk detail' : ''}`}
                        className={`text-right font-semibold whitespace-nowrap tabular-nums ${drillable ? 'cursor-pointer hover:bg-accent/60' : ''}`}
                        onClick={drillable ? () => setDrill(filter) : undefined}
                    >
                        {nShort(row.total)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums text-muted-foreground">{share.toFixed(1)}%</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">{nFull(row.qty)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">{row.invoices.toLocaleString('id-ID')}</TableCell>
                </TableRow>
            );
            return isOpen ? [tr, ...renderLevel(rowPath, depth + 1)] : [tr];
        });
    };

    const availableDims = ALL_DIMS.filter((d) => !dims.includes(d));

    return (
        <DashboardLayout breadcrumbs={breadcrumbs}>
            <Head title="Penjualan per Merk" />
            <div className="flex flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-2xl font-semibold">Penjualan per Merk (Principal)</h1>
                        <p className="text-sm text-muted-foreground">
                            Analisa pivot ala Excel — klik <ChevronRight className="inline size-3.5" /> untuk membuka level berikutnya (sales, region,
                            rumah sakit), klik angka untuk melihat transaksi detailnya.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {hasData && (
                            <Button type="button" variant="outline" onClick={exportExcel} disabled={exporting} className="gap-1.5">
                                {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
                                Export Excel
                            </Button>
                        )}
                        <Select value={metric} onValueChange={(v) => setMetric(v as 'dpp' | 'total' | 'qty')}>
                            <SelectTrigger className="w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(METRIC_LABELS).map(([k, label]) => (
                                    <SelectItem key={k} value={k}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={year} onValueChange={setYear}>
                            <SelectTrigger className="w-28">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {years.map((y) => (
                                    <SelectItem key={y} value={y}>
                                        {y}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {!hasData ? (
                    <Card>
                        <CardContent className="flex h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                            <p>Belum ada data penjualan.</p>
                            <p className="text-sm">Buka menu Integrasi Data lalu klik "Sinkronkan dari ERP".</p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                            <span className="text-xs font-medium text-muted-foreground">Susunan baris:</span>
                            {dims.map((d, i) => (
                                <span key={d} className="flex items-center gap-0.5 rounded-md border bg-background py-0.5 pr-1 pl-2 text-xs font-medium">
                                    {i > 0 && (
                                        <button type="button" onClick={() => moveDim(i, -1)} className="rounded p-0.5 hover:bg-accent" title="Geser ke atas hirarki">
                                            <ChevronLeft className="size-3" />
                                        </button>
                                    )}
                                    {DIM_LABELS[d]}
                                    {i < dims.length - 1 && (
                                        <button type="button" onClick={() => moveDim(i, 1)} className="rounded p-0.5 hover:bg-accent" title="Geser ke bawah hirarki">
                                            <ChevronRight className="size-3" />
                                        </button>
                                    )}
                                    {dims.length > 1 && (
                                        <button type="button" onClick={() => removeDim(d)} className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="Hapus dimensi">
                                            <X className="size-3" />
                                        </button>
                                    )}
                                </span>
                            ))}
                            {availableDims.length > 0 && <span className="mx-1 text-xs text-muted-foreground">·</span>}
                            {availableDims.map((d) => (
                                <Button key={d} type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={() => addDim(d)}>
                                    <Plus className="size-3" /> {DIM_LABELS[d]}
                                </Button>
                            ))}
                        </div>

                        <div className="overflow-x-auto rounded-md border">
                            <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2.5">
                                <TableHeader>
                                    <TableRow className="bg-muted/60">
                                        <TableHead className="sticky left-0 z-10 min-w-[240px] bg-muted">
                                            {dims.map((d) => DIM_LABELS[d]).join(' → ')}
                                        </TableHead>
                                        {MONTHS_ID.map((m) => (
                                            <TableHead key={m} className="text-right whitespace-nowrap">
                                                {m}
                                            </TableHead>
                                        ))}
                                        <TableHead className="text-right whitespace-nowrap">Total {METRIC_LABELS[metric]}</TableHead>
                                        <TableHead className="text-right">%</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Invoice</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {root && root.rows.length > 0 && (
                                        <TableRow className="border-b-2 font-bold">
                                            <TableCell className="sticky left-0 z-10 bg-background whitespace-nowrap">TOTAL {year}</TableCell>
                                            {grandMonths.map((v, i) => (
                                                <TableCell key={i} title={nFull(v)} className="text-right whitespace-nowrap tabular-nums">
                                                    {v > 0 ? nShort(v) : '–'}
                                                </TableCell>
                                            ))}
                                            <TableCell title={nFull(grandTotal)} className="text-right whitespace-nowrap tabular-nums">
                                                {nShort(grandTotal)}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">100%</TableCell>
                                            <TableCell className="text-right whitespace-nowrap tabular-nums">{nFull(grandQty)}</TableCell>
                                            <TableCell className="text-right whitespace-nowrap tabular-nums">{grandInvoices.toLocaleString('id-ID')}</TableCell>
                                        </TableRow>
                                    )}
                                    {renderLevel([], 0)}
                                </TableBody>
                            </Table>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Nilai dalam Rupiah ({METRIC_LABELS[metric]}), disingkat: <b>jt</b> = juta, <b>M</b> = miliar — arahkan kursor untuk angka
                            penuh. Kolom % = kontribusi terhadap total tahun berjalan. Baris "(kosong)" = data ERP tanpa isian pada dimensi tersebut.
                        </p>
                    </>
                )}
            </div>

            <DrilldownDialog filter={drill} onClose={() => setDrill(null)} />
        </DashboardLayout>
    );
}
