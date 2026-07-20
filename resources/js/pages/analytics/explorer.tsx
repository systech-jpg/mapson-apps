import { DrilldownDialog, type DrillFilter } from '@/components/drilldown-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import DashboardLayout from '@/layouts/dashboard-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { BarChart3, ChevronLeft, ChevronRight, FileSpreadsheet, LineChart, LoaderCircle, Plus, Table2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { PivotChart, type ChartDatum, type ChartType } from './partials/pivot-chart';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Pivot Data Penjualan', href: '/analytics/explorer' }];

interface Field { key: string; label: string; group: string }
interface Measure { key: string; label: string; format: string }
interface Props {
    dimensions: Field[];
    measures: Measure[];
    years: string[];
    canSeeSensitive: boolean;
    hasData: boolean;
}

interface PivotRow { keys: string[]; vals: number[] }
interface PivotResp {
    rowDims: number;
    colDims: number;
    values: { key: string; label: string; format: string }[];
    rows: PivotRow[];
    truncated: boolean;
    error?: string;
}

type Zone = 'shelf' | 'filter' | 'rows' | 'cols' | 'values';
const EMPTY = '(kosong)';

interface Grid {
    rowDims: number;
    colDims: number;
    rowCombos: string[][];
    colCombos: string[][];
    at: (rc: string[], cc: string[], m: number) => number;
    rowTotal: (rc: string[]) => number;
    grandByMeasure: number[];
}

// ---- format helpers -------------------------------------------------------
const rpC = (n: number) => {
    const x = Number(n || 0);
    if (Math.abs(x) >= 1e9) return 'Rp ' + (x / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (Math.abs(x) >= 1e6) return 'Rp ' + (x / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return 'Rp ' + x.toLocaleString('id-ID');
};
const nShort = (n: number) => {
    const x = Number(n || 0);
    if (Math.abs(x) >= 1e9) return (x / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (Math.abs(x) >= 1e6) return (x / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return x.toLocaleString('id-ID', { maximumFractionDigits: 0 });
};
const fmtFor = (format: string) => (n: number) => {
    if (format === 'money') return rpC(n);
    if (format === 'pct') return Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%';
    return Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: format === 'qty' ? 2 : 0 });
};
const cellShort = (n: number, format: string) => (format === 'pct' ? Number(n || 0).toFixed(1) + '%' : nShort(n));

const TIME_KEYS = new Set(['tahun', 'kuartal', 'bulan', 'minggu']);

type ChipAction = { label: string; onSelect: () => void; danger?: boolean };

// ---- chip (klik → menu aksi) ---------------------------------------------
function Chip({ label, onRemove, onClick, actions, muted, reorder }: { label: string; onRemove?: () => void; onClick?: () => void; actions?: ChipAction[]; muted?: boolean; reorder?: React.ReactNode }) {
    const labelCls = 'max-w-[170px] cursor-pointer truncate hover:text-primary';
    return (
        <span className={`flex items-center gap-0.5 rounded-md border py-1 pr-1 pl-2 text-xs font-medium ${muted ? 'bg-muted/40' : 'bg-background'}`}>
            {actions ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button type="button" className={labelCls} title={`${label} — klik untuk atur`}>{label}</button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-40">
                        {actions.map((a, i) =>
                            a.danger ? (
                                <span key={a.label}>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={a.onSelect} className="text-red-600 focus:text-red-600">{a.label}</DropdownMenuItem>
                                </span>
                            ) : (
                                <DropdownMenuItem key={a.label} onSelect={a.onSelect}>{a.label}</DropdownMenuItem>
                            ),
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : onClick ? (
                <button type="button" onClick={onClick} className={labelCls} title={`${label} — klik`}>{label}</button>
            ) : (
                <span className="max-w-[170px] truncate" title={label}>{label}</span>
            )}
            {reorder}
            {onRemove && (
                <button type="button" onClick={onRemove} className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="Hapus">
                    <X className="size-3" />
                </button>
            )}
        </span>
    );
}

// ---- zone box -------------------------------------------------------------
function Zone({ title, hint, children, accent, add }: { title: string; hint: string; children: React.ReactNode[]; accent?: string; add?: ChipAction[] }) {
    return (
        <div className="min-h-[56px] rounded-md border bg-card p-2">
            <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase">
                    <span className={`size-2 rounded-sm ${accent ?? 'bg-muted-foreground/40'}`} /> {title}
                </div>
                {add && add.length > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" title={`Tambah ke ${title}`}><Plus className="size-3.5" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="max-h-72 w-52 overflow-y-auto">
                            {add.map((a) => <DropdownMenuItem key={a.label} onSelect={a.onSelect}>{a.label}</DropdownMenuItem>)}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">{children.length ? children : <span className="text-xs text-muted-foreground">{hint}</span>}</div>
        </div>
    );
}

export default function PivotExplorer({ dimensions, measures, years, canSeeSensitive, hasData }: Props) {
    const [rows, setRows] = useState<string[]>([]);
    const [cols, setCols] = useState<string[]>([]);
    const [filterDims, setFilterDims] = useState<string[]>([]);
    const [values, setValues] = useState<string[]>(['dpp']);
    const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
    const [optCache, setOptCache] = useState<Record<string, string[]>>({});
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const [data, setData] = useState<PivotResp | null>(null);
    const [loading, setLoading] = useState(false);
    const [drill, setDrill] = useState<DrillFilter | null>(null);
    const [view, setView] = useState<'table' | 'chart'>('table');
    const [chartType, setChartType] = useState<ChartType>('bar');

    const dimByKey = useMemo(() => Object.fromEntries(dimensions.map((d) => [d.key, d])), [dimensions]);
    const measByKey = useMemo(() => Object.fromEntries(measures.map((m) => [m.key, m])), [measures]);
    const isMeasure = (key: string) => key in measByKey;
    const labelOf = (key: string) => dimByKey[key]?.label ?? measByKey[key]?.label ?? key;

    const used = new Set([...rows, ...cols, ...filterDims, ...values]);
    const shelfDims = dimensions.filter((d) => !used.has(d.key));
    const shelfMeas = measures.filter((m) => !used.has(m.key));
    const groups = useMemo(() => [...new Set(dimensions.map((d) => d.group))], [dimensions]);

    const relocate = (key: string, zone: Zone) => {
        const measure = isMeasure(key);
        const ok = zone === 'shelf' || (zone === 'values' ? measure : !measure);
        if (!ok) return;
        setRows((a) => (zone === 'rows' ? [...a.filter((x) => x !== key), key] : a.filter((x) => x !== key)));
        setCols((a) => (zone === 'cols' ? [...a.filter((x) => x !== key), key] : a.filter((x) => x !== key)));
        setFilterDims((a) => (zone === 'filter' ? [...a.filter((x) => x !== key), key] : a.filter((x) => x !== key)));
        setValues((a) => (zone === 'values' ? [...a.filter((x) => x !== key), key] : a.filter((x) => x !== key)));
        if (zone === 'shelf' || zone === 'rows' || zone === 'cols') {
            setFilterValues((fv) => {
                const { [key]: _drop, ...rest } = fv;
                return rest;
            });
        }
    };

    // Aksi menu untuk sebuah chip yang sedang berada di `current`.
    const ZONE_LABEL: Record<string, string> = { rows: 'Baris', cols: 'Kolom', filter: 'Filter', values: 'Nilai' };
    const zoneActions = (key: string, current: Zone): ChipAction[] => {
        const targets: Zone[] = isMeasure(key) ? ['values'] : ['rows', 'cols', 'filter'];
        const verb = current === 'shelf' ? 'Ke' : 'Pindah ke';
        const items: ChipAction[] = targets.filter((z) => z !== current).map((z) => ({ label: `${verb} ${ZONE_LABEL[z]}`, onSelect: () => relocate(key, z) }));
        if (current !== 'shelf') items.push({ label: 'Hapus', onSelect: () => relocate(key, 'shelf'), danger: true });
        return items;
    };
    // Daftar field yang bisa ditambahkan ke sebuah zona (dari yang belum terpakai).
    const addList = (zone: Zone): ChipAction[] => {
        const pool = zone === 'values' ? shelfMeas : shelfDims;
        return pool.map((f) => ({ label: f.label, onSelect: () => relocate(f.key, zone) }));
    };

    const moveDim = (arr: string[], setter: (v: string[]) => void, i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= arr.length) return;
        const next = [...arr];
        [next[i], next[j]] = [next[j], next[i]];
        setter(next);
    };

    // Muat opsi nilai untuk sebuah dimensi filter (lazy, sekali).
    const loadOptions = (dim: string) => {
        if (optCache[dim]) return;
        const p = new URLSearchParams({ dim });
        fetch(`${route('analytics.explorer.values')}?${p}`, { headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
            .then((r) => r.json())
            .then((j: { values: string[] }) => setOptCache((c) => ({ ...c, [dim]: j.values ?? [] })))
            .catch(() => {});
    };
    const toggleFilterValue = (dim: string, val: string) => {
        setFilterValues((fv) => {
            const cur = fv[dim] ?? [];
            const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
            return { ...fv, [dim]: next };
        });
    };

    // ---- fetch pivot ------------------------------------------------------
    const paramsOf = () => {
        const p = new URLSearchParams();
        rows.forEach((k) => p.append('rows[]', k));
        cols.forEach((k) => p.append('cols[]', k));
        values.forEach((k) => p.append('values[]', k));
        Object.entries(filterValues).forEach(([dim, vals]) => vals.forEach((v) => p.append(`filters[${dim}][]`, v)));
        if (dateFrom) p.set('date_from', dateFrom);
        if (dateTo) p.set('date_to', dateTo);
        return p;
    };
    const depKey = JSON.stringify([rows, cols, values, filterValues, dateFrom, dateTo]);

    useEffect(() => {
        if (values.length === 0) {
            setData(null);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        fetch(`${route('analytics.explorer.pivot')}?${paramsOf()}`, {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
            signal: controller.signal,
        })
            .then((r) => r.json())
            .then((j: PivotResp) => setData(j))
            .catch(() => {})
            .finally(() => setLoading(false));
        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depKey]);

    // ---- cross-tab derivation --------------------------------------------
    const grid = useMemo<Grid | null>(() => {
        if (!data || !data.rows) return null;
        const { rowDims, colDims } = data;
        const cell = new Map<string, number[]>();
        data.rows.forEach((r) => cell.set(JSON.stringify(r.keys), r.vals));

        const uniq = (list: string[][]) => {
            const seen = new Map<string, string[]>();
            list.forEach((k) => { const s = JSON.stringify(k); if (!seen.has(s)) seen.set(s, k); });
            return [...seen.values()];
        };
        let rowCombos = uniq(data.rows.map((r) => r.keys.slice(0, rowDims)));
        let colCombos = colDims > 0 ? uniq(data.rows.map((r) => r.keys.slice(rowDims))) : [[]];

        const at = (rc: string[], cc: string[], m: number) => cell.get(JSON.stringify([...rc, ...cc]))?.[m] ?? 0;

        // urutkan baris & kolom menurut metrik pertama (desc)
        const rowTotal = (rc: string[]) => colCombos.reduce((s, cc) => s + at(rc, cc, 0), 0);
        const colTotal = (cc: string[]) => rowCombos.reduce((s, rc) => s + at(rc, cc, 0), 0);
        rowCombos = rowCombos.sort((a, b) => rowTotal(b) - rowTotal(a));
        if (colDims > 0) colCombos = colCombos.sort((a, b) => colTotal(b) - colTotal(a));

        const grandByMeasure = data.values.map((_, m) => data.rows.reduce((s, r) => s + (r.vals[m] ?? 0), 0));
        return { rowDims, colDims, rowCombos, colCombos, at, rowTotal, grandByMeasure };
    }, [data]);

    // ---- chart data -------------------------------------------------------
    const chart = useMemo(() => {
        if (!grid || !data) return null;
        const cap = 40;
        const cats = grid.rowCombos.slice(0, cap);
        const name = (rc: string[]) => rc.join(' / ') || 'Total';
        if (grid.colDims > 0) {
            const series = grid.colCombos.slice(0, 12).map((cc) => ({ key: cc.join(' / ') || 'Total', label: cc.join(' / ') || 'Total', cc }));
            const rowsData: ChartDatum[] = cats.map((rc) => {
                const o: ChartDatum = { name: name(rc) };
                series.forEach((s) => { o[s.key] = grid.at(rc, s.cc, 0); });
                return o;
            });
            return { data: rowsData, series: series.map((s) => ({ key: s.key, label: s.label })), fmt: fmtFor(data.values[0]?.format ?? 'money') };
        }
        const series = data.values.map((v) => ({ key: v.key, label: v.label }));
        const rowsData: ChartDatum[] = cats.map((rc) => {
            const o: ChartDatum = { name: name(rc) };
            data.values.forEach((v, m) => { o[v.key] = grid.at(rc, [], m); });
            return o;
        });
        return { data: rowsData, series, fmt: fmtFor(data.values[0]?.format ?? 'money') };
    }, [grid, data]);

    // ---- drilldown from a cell -------------------------------------------
    const openCell = (rc: string[], cc: string[]) => {
        const f: DrillFilter = {};
        rows.forEach((dk, i) => (f[`f[${dk}]`] = rc[i]));
        cols.forEach((dk, i) => (f[`f[${dk}]`] = cc[i]));
        Object.entries(filterValues).forEach(([dk, vals]) => { if (vals.length === 1) f[`f[${dk}]`] = vals[0]; });
        setDrill(f);
    };

    // ---- export -----------------------------------------------------------
    const [exporting, setExporting] = useState(false);
    const exportExcel = async () => {
        setExporting(true);
        try {
            const res = await fetch(`${route('analytics.explorer.export')}?${paramsOf()}`, {
                headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin',
            });
            const j: { dims: { key: string; label: string }[]; values: { key: string; label: string }[]; rows: PivotRow[] } = await res.json();
            const header = [...j.dims.map((d) => d.label), ...j.values.map((v) => v.label)];
            const body = j.rows.map((r) => [...r.keys, ...r.vals]);
            const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
            ws['!cols'] = [...j.dims.map(() => ({ wch: 24 })), ...j.values.map(() => ({ wch: 15 }))];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Pivot');
            XLSX.writeFile(wb, `pivot-explorer-${new Date().toISOString().slice(0, 10)}.xlsx`);
        } finally {
            setExporting(false);
        }
    };

    const reorderBtns = (arr: string[], setter: (v: string[]) => void, i: number) => (
        <span className="flex">
            {i > 0 && <button type="button" onClick={() => moveDim(arr, setter, i, -1)} className="rounded p-0.5 hover:bg-accent" title="Geser"><ChevronLeft className="size-3" /></button>}
            {i < arr.length - 1 && <button type="button" onClick={() => moveDim(arr, setter, i, 1)} className="rounded p-0.5 hover:bg-accent" title="Geser"><ChevronRight className="size-3" /></button>}
        </span>
    );

    return (
        <DashboardLayout breadcrumbs={breadcrumbs}>
            <Head title="Pivot Data Penjualan" />
            <div className="flex flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-2xl font-semibold">Pivot Data Penjualan</h1>
                        <p className="text-sm text-muted-foreground">
                            <b>Klik</b> field lalu pilih zona (<b>Baris</b>/<b>Kolom</b>/<b>Filter</b>/<b>Nilai</b>), atau pakai tombol <Plus className="inline size-3" /> di tiap zona. Klik angka untuk detail transaksi.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex rounded-md border p-0.5">
                            <Button size="sm" variant={view === 'table' ? 'default' : 'ghost'} className="h-7 gap-1 px-2" onClick={() => setView('table')}><Table2 className="size-3.5" /> Tabel</Button>
                            <Button size="sm" variant={view === 'chart' ? 'default' : 'ghost'} className="h-7 gap-1 px-2" onClick={() => setView('chart')}><BarChart3 className="size-3.5" /> Chart</Button>
                        </div>
                        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={exportExcel} disabled={exporting || !data}>
                            {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} Export
                        </Button>
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
                    <div>
                        <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                            {/* Field shelf */}
                            <Card className="h-fit lg:sticky lg:top-2 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
                                <CardContent className="space-y-3 p-3">
                                    <div>
                                        <p className="text-[11px] font-semibold text-muted-foreground uppercase">Field</p>
                                        <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">Klik nama field lalu pilih zona tujuannya.</p>
                                    </div>
                                    {shelfMeas.length > 0 && (
                                        <div className="space-y-1 rounded-md bg-violet-50 p-1.5 dark:bg-violet-950/20">
                                            <p className="text-[10px] font-medium text-violet-700 dark:text-violet-400">Metrik (Nilai)</p>
                                            <div className="flex flex-wrap gap-1">
                                                {shelfMeas.map((m) => <Chip key={m.key} label={m.label} muted onClick={() => relocate(m.key, 'values')} />)}
                                            </div>
                                        </div>
                                    )}
                                    {groups.map((g) => {
                                        const items = shelfDims.filter((d) => d.group === g);
                                        if (!items.length) return null;
                                        return (
                                            <div key={g} className="space-y-1">
                                                <p className="text-[10px] text-muted-foreground">{g}</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {items.map((d) => <Chip key={d.key} label={d.label} muted actions={zoneActions(d.key, 'shelf')} />)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {!canSeeSensitive && <p className="border-t pt-2 text-[10px] text-muted-foreground">Beberapa field (pasien/dokter) disembunyikan sesuai izin Anda.</p>}
                                </CardContent>
                            </Card>

                            {/* Zones + result */}
                            <div className="space-y-3">
                              <div className="sticky top-2 z-20 space-y-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                    <Zone title="Filter" hint="klik + atau field di sidebar" accent="bg-amber-500" add={addList('filter')}>
                                        {filterDims.map((k) => {
                                            const sel = filterValues[k]?.length ?? 0;
                                            return (
                                                <DropdownMenu key={k} onOpenChange={(o) => o && loadOptions(k)}>
                                                    <DropdownMenuTrigger asChild>
                                                        <span>
                                                            <Chip label={`${labelOf(k)}${sel ? ` (${sel})` : ''}`} onRemove={() => relocate(k, 'shelf')} />
                                                        </span>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent className="max-h-72 w-56 overflow-y-auto">
                                                        {(optCache[k] ?? []).length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">memuat…</div>}
                                                        {(optCache[k] ?? []).map((v) => (
                                                            <DropdownMenuCheckboxItem key={v} checked={filterValues[k]?.includes(v) ?? false} onCheckedChange={() => toggleFilterValue(k, v)} onSelect={(e) => e.preventDefault()}>
                                                                <span className="truncate" title={v}>{v || EMPTY}</span>
                                                            </DropdownMenuCheckboxItem>
                                                        ))}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            );
                                        })}
                                    </Zone>
                                    <Zone title="Baris" hint="klik + atau field di sidebar" accent="bg-primary" add={addList('rows')}>
                                        {rows.map((k, i) => <Chip key={k} label={labelOf(k)} actions={zoneActions(k, 'rows')} onRemove={() => relocate(k, 'shelf')} reorder={reorderBtns(rows, setRows, i)} />)}
                                    </Zone>
                                    <Zone title="Kolom" hint="klik + atau field di sidebar" accent="bg-sky-500" add={addList('cols')}>
                                        {cols.map((k, i) => <Chip key={k} label={labelOf(k)} actions={zoneActions(k, 'cols')} onRemove={() => relocate(k, 'shelf')} reorder={reorderBtns(cols, setCols, i)} />)}
                                    </Zone>
                                    <Zone title="Nilai" hint="klik + atau metrik di sidebar" accent="bg-violet-500" add={addList('values')}>
                                        {values.map((k) => <Chip key={k} label={labelOf(k)} onRemove={() => relocate(k, 'shelf')} />)}
                                    </Zone>
                                </div>

                                {/* date range */}
                                <div className="flex flex-wrap items-end gap-2">
                                    <div className="grid gap-1"><Label className="text-[11px]">Tanggal dari</Label><Input type="date" className="h-8 w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
                                    <div className="grid gap-1"><Label className="text-[11px]">sampai</Label><Input type="date" className="h-8 w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
                                    {(dateFrom || dateTo) && <Button variant="ghost" size="sm" className="h-8" onClick={() => { setDateFrom(''); setDateTo(''); }}>Reset tanggal</Button>}
                                    {view === 'chart' && (
                                        <div className="ml-auto flex rounded-md border p-0.5">
                                            <Button size="sm" variant={chartType === 'bar' ? 'default' : 'ghost'} className="h-7 gap-1 px-2" onClick={() => setChartType('bar')}><BarChart3 className="size-3.5" /> Bar</Button>
                                            <Button size="sm" variant={chartType === 'line' ? 'default' : 'ghost'} className="h-7 gap-1 px-2" onClick={() => setChartType('line')}><LineChart className="size-3.5" /> Line</Button>
                                            <Button size="sm" variant={chartType === 'heatmap' ? 'default' : 'ghost'} className="h-7 px-2" onClick={() => setChartType('heatmap')}>Heatmap</Button>
                                        </div>
                                    )}
                                </div>
                              </div>

                                {data?.truncated && <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Hasil dipangkas karena kombinasi terlalu banyak — persempit filter atau kurangi dimensi.</p>}

                                <div className="relative min-h-[200px]">
                                    {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60"><LoaderCircle className="size-5 animate-spin" /></div>}
                                    {values.length === 0 ? (
                                        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Klik atau tarik minimal satu <b className="mx-1">metrik</b> (mis. Penjualan DPP) ke zona Nilai.</div>
                                    ) : view === 'chart' ? (
                                        <Card><CardContent className="p-4">{chart && <PivotChart type={chartType} data={chart.data} series={chart.series} fmt={chart.fmt} />}</CardContent></Card>
                                    ) : (
                                        grid && data && <PivotTable grid={grid} data={data} rowKeys={rows} labelOf={labelOf} onCell={openCell} />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                )}
            </div>

            <DrilldownDialog filter={drill} onClose={() => setDrill(null)} routeName="analytics.explorer.drilldown" />
        </DashboardLayout>
    );
}

// ---- cross-tab table ------------------------------------------------------
function PivotTable({
    grid, data, rowKeys, labelOf, onCell,
}: {
    grid: Grid;
    data: PivotResp;
    rowKeys: string[];
    labelOf: (k: string) => string;
    onCell: (rc: string[], cc: string[]) => void;
}) {
    const { rowCombos, colCombos, colDims, at, grandByMeasure } = grid;
    const measures = data.values;
    const nMeas = measures.length;
    const showColGroups = colDims > 0;
    const grandFirst = grandByMeasure[0] || 0;

    return (
        <div className="overflow-x-auto rounded-md border">
            <Table className="text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:px-2.5">
                <TableHeader>
                    {showColGroups && (
                        <TableRow className="bg-muted/60">
                            {rowKeys.map((k) => <TableHead key={k} className="align-bottom" rowSpan={2}>{labelOf(k)}</TableHead>)}
                            {colCombos.map((cc, ci) => <TableHead key={ci} colSpan={nMeas} className="border-l text-center whitespace-nowrap">{cc.join(' / ') || 'Total'}</TableHead>)}
                            <TableHead colSpan={nMeas} className="border-l bg-muted text-center">Total</TableHead>
                        </TableRow>
                    )}
                    <TableRow className="bg-muted/60">
                        {!showColGroups && rowKeys.map((k) => <TableHead key={k}>{labelOf(k)}</TableHead>)}
                        {!showColGroups && rowKeys.length === 0 && <TableHead>Ringkasan</TableHead>}
                        {(showColGroups ? colCombos : [[]]).map((cc, ci) =>
                            measures.map((m) => <TableHead key={ci + m.key} className={`text-right whitespace-nowrap ${showColGroups && m === measures[0] ? 'border-l' : ''}`}>{m.label}</TableHead>),
                        )}
                        {showColGroups && measures.map((m) => <TableHead key={'t' + m.key} className={`text-right whitespace-nowrap ${m === measures[0] ? 'border-l bg-muted' : 'bg-muted'}`}>{m.label}</TableHead>)}
                        {!showColGroups && <TableHead className="text-right">%</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rowCombos.length === 0 ? (
                        <TableRow><TableCell colSpan={rowKeys.length + nMeas + 2} className="py-8 text-center text-muted-foreground">Tidak ada data.</TableCell></TableRow>
                    ) : (
                        rowCombos.map((rc, ri) => {
                            const rowTot = grid.rowTotal(rc);
                            return (
                                <TableRow key={ri}>
                                    {rowKeys.map((k, i) => <TableCell key={k} className="whitespace-nowrap font-medium" title={rc[i]}>{rc[i]}</TableCell>)}
                                    {rowKeys.length === 0 && <TableCell className="font-medium">Total</TableCell>}
                                    {(showColGroups ? colCombos : [[]]).map((cc, ci) =>
                                        measures.map((m, mi) => {
                                            const v = at(rc, cc, mi);
                                            return (
                                                <TableCell
                                                    key={ci + m.key}
                                                    className={`text-right tabular-nums ${showColGroups && mi === 0 ? 'border-l' : ''} ${v ? 'cursor-pointer hover:bg-accent/60' : 'text-muted-foreground/40'}`}
                                                    onClick={v ? () => onCell(rc, cc) : undefined}
                                                    title={v ? fmtFor(m.format)(v) + ' — klik untuk detail' : undefined}
                                                >
                                                    {v ? cellShort(v, m.format) : '–'}
                                                </TableCell>
                                            );
                                        }),
                                    )}
                                    {showColGroups && measures.map((m, mi) => {
                                        const v = data.rows.filter((r) => JSON.stringify(r.keys.slice(0, grid.rowDims)) === JSON.stringify(rc)).reduce((s, r) => s + (r.vals[mi] ?? 0), 0);
                                        return <TableCell key={'t' + m.key} className={`text-right font-semibold tabular-nums ${mi === 0 ? 'border-l bg-muted/40' : 'bg-muted/40'}`}>{v ? cellShort(v, m.format) : '–'}</TableCell>;
                                    })}
                                    {!showColGroups && <TableCell className="text-right tabular-nums text-muted-foreground">{grandFirst > 0 ? ((rowTot / grandFirst) * 100).toFixed(1) + '%' : '–'}</TableCell>}
                                </TableRow>
                            );
                        })
                    )}
                    {/* grand total */}
                    {rowCombos.length > 0 && (
                        <TableRow className="border-t-2 font-bold">
                            {rowKeys.length > 0 ? <TableCell colSpan={rowKeys.length}>TOTAL</TableCell> : <TableCell>TOTAL</TableCell>}
                            {(showColGroups ? colCombos : [[]]).map((cc, ci) =>
                                measures.map((m, mi) => {
                                    const v = rowCombos.reduce((s, rc) => s + at(rc, cc, mi), 0);
                                    return <TableCell key={ci + m.key} className={`text-right tabular-nums ${showColGroups && mi === 0 ? 'border-l' : ''}`}>{v ? cellShort(v, m.format) : '–'}</TableCell>;
                                }),
                            )}
                            {showColGroups && measures.map((m, mi) => <TableCell key={'gt' + m.key} className={`text-right tabular-nums ${mi === 0 ? 'border-l bg-muted' : 'bg-muted'}`}>{grandByMeasure[mi] ? cellShort(grandByMeasure[mi], m.format) : '–'}</TableCell>)}
                            {!showColGroups && <TableCell className="text-right tabular-nums">100%</TableCell>}
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
