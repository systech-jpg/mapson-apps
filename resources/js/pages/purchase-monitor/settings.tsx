import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { CloudDownload, DatabaseZap, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';

interface Vendor { vendor_name: string; n_lines: number; total_asli: number; principal_id: number | null; default_currency: string }
interface Principal { id: number; name: string }
interface FxRate { id: number; currency: string; period: string; rate_to_idr: number; source: string; note: string | null }
interface LastSync { created_at: string; summary: string | null }
interface DataRange { dari: string | null; sampai: string | null; n: number }
interface Props { vendors: Vendor[]; principals: Principal[]; fxRates: FxRate[]; currencies: string[]; lastSync: LastSync | null; dataRange: DataRange }

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integrasi Data', href: '#' },
    { title: 'Monitoring Pembelian', href: '/integration/purchase-monitor' },
    { title: 'Pengaturan', href: '/integration/purchase-monitor/settings' },
];

const NONE = 'none';
const num = (n: number, d = 0) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: d });

export default function PurchaseMonitorSettings({ vendors, principals, fxRates, currencies, lastSync, dataRange }: Props) {
    const [q, setQ] = useState('');

    const rows = useMemo(() => {
        const s = q.trim().toLowerCase();
        return s ? vendors.filter((v) => v.vendor_name.toLowerCase().includes(s)) : vendors;
    }, [vendors, q]);

    const saveVendor = (v: Vendor, patch: Partial<Vendor>) =>
        router.post(route('purchase-monitor.mapping'), {
            vendor_name: v.vendor_name,
            principal_id: patch.principal_id !== undefined ? patch.principal_id : v.principal_id,
            default_currency: patch.default_currency ?? v.default_currency,
        }, { preserveScroll: true, preserveState: false });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Pengaturan Monitoring Pembelian" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-2xl font-semibold">Pengaturan Monitoring Pembelian</h1>
                    <p className="text-sm text-muted-foreground">
                        Petakan vendor ke principal &amp; tetapkan mata uangnya, dan kelola kurs per bulan yang dipakai untuk konversi ke IDR.
                    </p>
                </div>

                <SyncCard lastSync={lastSync} dataRange={dataRange} />

                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <CardTitle className="text-base">Mapping Vendor → Principal</CardTitle>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" className="h-8 gap-1.5"
                                    onClick={() => router.post(route('purchase-monitor.refresh-vendors'), {}, { preserveScroll: true })}>
                                    <RefreshCw className="size-3.5" /> Tarik vendor baru
                                </Button>
                                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari vendor…" className="h-8 w-52" />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {rows.length} vendor. Vendor tanpa principal tetap tampil di dashboard dengan namanya sendiri. Mengubah mata uang menyelaraskan semua baris pembelian vendor itu.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table className="text-sm [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Vendor</TableHead>
                                        <TableHead className="text-right">Baris</TableHead>
                                        <TableHead className="text-right">Total (asli)</TableHead>
                                        <TableHead className="w-28">Mata Uang</TableHead>
                                        <TableHead className="w-64">Principal</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((v) => (
                                        <TableRow key={v.vendor_name}>
                                            <TableCell className="font-medium">
                                                {v.vendor_name}
                                                {v.principal_id === null && <Badge variant="outline" className="ml-1.5 border-muted-foreground/40 text-[10px] text-muted-foreground">belum di-map</Badge>}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums text-muted-foreground">{num(v.n_lines)}</TableCell>
                                            <TableCell className="text-right tabular-nums whitespace-nowrap">{v.default_currency} {num(v.total_asli, 0)}</TableCell>
                                            <TableCell>
                                                <Select value={v.default_currency} onValueChange={(val) => saveVendor(v, { default_currency: val })}>
                                                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Select value={v.principal_id ? String(v.principal_id) : NONE}
                                                    onValueChange={(val) => saveVendor(v, { principal_id: val === NONE ? null : Number(val) })}>
                                                    <SelectTrigger className={`h-8 ${v.principal_id ? '' : 'text-muted-foreground'}`}><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value={NONE}>— tanpa principal —</SelectItem>
                                                        {principals.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <FxSection fxRates={fxRates} currencies={currencies.filter((c) => c !== 'IDR')} />
            </div>
        </AppLayout>
    );
}

function SyncCard({ lastSync, dataRange }: { lastSync: LastSync | null; dataRange: DataRange }) {
    const [from, setFrom] = useState('');
    const [syncing, setSyncing] = useState(false);

    const sync = () =>
        router.post(route('purchase-monitor.sync-purchases'), from ? { from } : {}, {
            preserveScroll: true, onStart: () => setSyncing(true), onFinish: () => setSyncing(false),
        });

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">Sinkronisasi Pembelian Accurate</CardTitle>
                    <div className="flex items-end gap-2">
                        <div>
                            <label className="text-[11px] text-muted-foreground">Mulai dari (opsional)</label>
                            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
                        </div>
                        <Button size="sm" className="h-8 gap-1.5" disabled={syncing} onClick={sync}>
                            <DatabaseZap className={`size-3.5 ${syncing ? 'animate-pulse' : ''}`} /> {syncing ? 'Menyinkronkan…' : 'Tarik pembelian'}
                        </Button>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">
                    Menarik faktur pembelian dari Accurate (default 24 bulan terakhir; isi tanggal untuk menarik lebih jauh ke belakang),
                    lalu otomatis mendaftarkan vendor baru & menyelaraskan mata uang. Proses bisa 1–2 menit — jangan tutup halaman.
                </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>Sync sukses terakhir: <b className="text-foreground">{lastSync ? new Date(lastSync.created_at).toLocaleString('id-ID') : 'belum pernah'}</b></span>
                <span>Data tersimpan: <b className="text-foreground">{num(dataRange.n)}</b> baris{dataRange.dari ? <> ({dataRange.dari} s/d {dataRange.sampai})</> : null}</span>
            </CardContent>
        </Card>
    );
}

function FxSection({ fxRates, currencies }: { fxRates: FxRate[]; currencies: string[] }) {
    const [currency, setCurrency] = useState(currencies[0] ?? 'USD');
    const [period, setPeriod] = useState('');
    const [rate, setRate] = useState('');
    const [fetching, setFetching] = useState(false);

    const fetchFx = () =>
        router.post(route('purchase-monitor.fetch-fx'), { currency }, {
            preserveScroll: true, onStart: () => setFetching(true), onFinish: () => setFetching(false),
        });

    const submit = () => {
        if (!period || !rate) return;
        router.post(route('purchase-monitor.fx'), { currency, period, rate_to_idr: Number(rate) },
            { preserveScroll: true, preserveState: false, onSuccess: () => { setPeriod(''); setRate(''); } });
    };

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">Kurs → IDR per Bulan</CardTitle>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled={fetching} onClick={fetchFx}>
                        <CloudDownload className={`size-3.5 ${fetching ? 'animate-pulse' : ''}`} /> {fetching ? 'Mengambil…' : `Ambil kurs ${currency} otomatis`}
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    Dipakai mengonversi pembelian mata uang asing. Isi manual di bawah, atau klik <b>Ambil kurs otomatis</b> untuk menarik kurs historis dari internet (butuh koneksi di server). Kurs yang belum ada memakai asumsi Rp 16.000.
                </p>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                    <div>
                        <label className="text-[11px] text-muted-foreground">Mata Uang</label>
                        <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>{currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div>
                        <label className="text-[11px] text-muted-foreground">Periode (YYYY-MM)</label>
                        <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-01" className="h-8 w-28" />
                    </div>
                    <div>
                        <label className="text-[11px] text-muted-foreground">Kurs ke IDR</label>
                        <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="16000" className="h-8 w-32 text-right" />
                    </div>
                    <Button size="sm" className="h-8" onClick={submit} disabled={!period || !rate}>Simpan Kurs</Button>
                </div>

                <div className="max-h-[40vh] overflow-auto">
                    <Table className="text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:h-7 [&_th]:px-2">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Periode</TableHead>
                                <TableHead>Mata Uang</TableHead>
                                <TableHead className="text-right">Kurs → IDR</TableHead>
                                <TableHead>Sumber</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fxRates.length === 0 ? (
                                <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Belum ada kurs.</TableCell></TableRow>
                            ) : fxRates.map((r) => (
                                <TableRow key={r.id}>
                                    <TableCell className="font-mono">{r.period}</TableCell>
                                    <TableCell>{r.currency}</TableCell>
                                    <TableCell className="text-right tabular-nums">{num(r.rate_to_idr, 2)}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={`text-[10px] ${r.source === 'external' ? 'border-emerald-400 text-emerald-600 dark:text-emerald-400' : r.source === 'manual' ? 'border-sky-400 text-sky-600 dark:text-sky-400' : ''}`}>
                                            {r.source === 'external' ? 'lookup' : r.source === 'manual' ? 'manual' : 'asumsi'}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
