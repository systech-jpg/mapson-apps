import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, LoaderCircle, Trash2, Upload, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Data Warehouse', href: '#' },
    { title: 'Pipeline Data', href: '/data-warehouse/pipeline' },
];

interface Source {
    key: string;
    nama: string;
    mode: string;
    baris: number;
    ket: string;
    terakhir: string | null;
}

interface GlPeriod {
    period: string;
    rows: number;
    accounts: number;
    debit: number;
    credit: number;
    balance: number;
    seimbang: boolean;
    imported_at: string | null;
    source_file: string | null;
    branch: string | null;
}

interface LogRow {
    id: number;
    channel: string;
    source: string;
    status: string;
    rows: number | null;
    message: string | null;
    at: string | null;
}

interface GlTemplate {
    sheet: string;
    preamble: string[][];
    headers: string[];
    examples: (string | number)[][];
    notes: string[];
}

interface Props {
    sources: Source[];
    glPeriods: GlPeriod[];
    logs: LogRow[];
    glTemplate: GlTemplate;
}

const rp = (n: number) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const num = (n: number) => Number(n || 0).toLocaleString('id-ID');

export default function DwhPipeline({ sources, glPeriods, logs, glTemplate }: Props) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // Template dirakit dari spesifikasi importer (dikirim server), jadi selalu sinkron
    // dengan format yang benar-benar diterima.
    const unduhTemplate = () => {
        const t = glTemplate;
        const aoa: (string | number)[][] = [
            ...t.preamble,
            t.headers,
            ...t.examples,
            [],
            ['CATATAN — hapus baris contoh & catatan sebelum mengunggah:'],
            ...t.notes.map((n) => [n]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [{ wch: 26 }, { wch: 24 }, { wch: 12 }, { wch: 32 }, { wch: 46 }, { wch: 16 }, { wch: 16 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, t.sheet);
        XLSX.writeFile(wb, 'template-histori-buku-besar.xlsx');
    };

    // Browser hanya mengubah xlsx -> baris mentah; seluruh penafsiran dilakukan server.
    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setErr(null);
        setBusy(true);
        try {
            const buf = await f.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            // raw:false + defval:'' -> setiap sel jadi string, jadi bentuknya string[][].
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as string[][];
            router.post(
                route('dwh.gl.upload'),
                { file_name: f.name, rows },
                {
                    preserveScroll: true,
                    onFinish: () => {
                        setBusy(false);
                        if (fileRef.current) fileRef.current.value = '';
                    },
                },
            );
        } catch (ex) {
            setErr('Gagal membaca file: ' + (ex instanceof Error ? ex.message : String(ex)));
            setBusy(false);
        }
    };

    const hapus = (p: string) => {
        if (confirm(`Hapus seluruh data Buku Besar periode ${p}?`)) {
            router.delete(route('dwh.gl.destroy', p), { preserveScroll: true });
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Pipeline Data" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">Pipeline Data</h1>
                    <p className="text-sm text-muted-foreground">Sumber data gudang data — mana yang ditarik otomatis, mana yang perlu diunggah.</p>
                </div>

                {/* Sumber data */}
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Sumber Data</CardTitle></CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Sumber</TableHead>
                                        <TableHead>Cara</TableHead>
                                        <TableHead className="text-right">Baris</TableHead>
                                        <TableHead>Terakhir</TableHead>
                                        <TableHead>Keterangan</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sources.map((s) => (
                                        <TableRow key={s.key}>
                                            <TableCell className="font-medium whitespace-nowrap">{s.nama}</TableCell>
                                            <TableCell>
                                                <Badge variant={s.mode === 'otomatis' ? 'default' : 'secondary'}>{s.mode}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{num(s.baris)}</TableCell>
                                            <TableCell className="whitespace-nowrap text-muted-foreground">{s.terakhir ?? '–'}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{s.ket}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* Upload GL */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Unggah Buku Besar (GL)</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Dari Manual Import: laporan <b>Histori Buku Besar</b>, <b>tanpa filter akun</b>, <b>satu bulan per file</b> (baris buku besar tidak memuat
                            tanggal, jadi periode dibaca dari judul laporan). Mengunggah periode yang sama akan <b>menimpa</b> data lama periode itu.
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy} className="hidden" id="gl-file" />
                            <Button asChild disabled={busy}>
                                <label htmlFor="gl-file" className="cursor-pointer">
                                    {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
                                    {busy ? 'Memproses…' : 'Pilih file Excel'}
                                </label>
                            </Button>
                            <Button type="button" variant="outline" onClick={unduhTemplate} className="gap-1.5">
                                <FileSpreadsheet className="size-4" /> Unduh Template
                            </Button>
                            <span className="text-xs text-muted-foreground">File dibaca di browser, lalu dikirim untuk diproses server.</span>
                        </div>

                        <div className="rounded-md border bg-muted/30 p-3 text-xs">
                            <p className="mb-1 font-medium">Export dari Manual Import bisa langsung diunggah apa adanya.</p>
                            <p className="text-muted-foreground">
                                Kolom dicari berdasarkan <b>judulnya</b>, bukan posisi — jadi kolom-kolom kosong pada export asli Manual Import tidak masalah dan
                                tak perlu dirapikan. Template hanya diperlukan bila Anda menyusun datanya sendiri. Kolom minimum:{' '}
                                <span className="font-mono">{glTemplate.headers.join(' · ')}</span>.
                            </p>
                        </div>
                        {err && (
                            <p className="flex items-center gap-1.5 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                                <XCircle className="size-3.5" /> {err}
                            </p>
                        )}

                        <div className="overflow-x-auto">
                            <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Periode</TableHead>
                                        <TableHead className="text-right">Baris</TableHead>
                                        <TableHead className="text-right">Akun</TableHead>
                                        <TableHead className="text-right">Debit</TableHead>
                                        <TableHead className="text-right">Kredit</TableHead>
                                        <TableHead>Seimbang</TableHead>
                                        <TableHead>Diunggah</TableHead>
                                        <TableHead />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {glPeriods.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Belum ada Buku Besar diunggah.</TableCell>
                                        </TableRow>
                                    ) : (
                                        glPeriods.map((p) => (
                                            <TableRow key={p.period}>
                                                <TableCell className="font-medium">
                                                    {p.period}
                                                    {p.branch && <div className="text-[11px] text-muted-foreground">{p.branch}</div>}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">{num(p.rows)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{num(p.accounts)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{rp(p.debit)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{rp(p.credit)}</TableCell>
                                                <TableCell>
                                                    {p.seimbang ? (
                                                        <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                                            <CheckCircle2 className="size-3.5" /> ya
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400" title={`selisih ${rp(p.balance)}`}>
                                                            <AlertTriangle className="size-3.5" /> selisih {rp(p.balance)}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                                    {p.imported_at ?? '–'}
                                                    {p.source_file && <div className="max-w-48 truncate" title={p.source_file}>{p.source_file}</div>}
                                                </TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" className="size-7" onClick={() => hapus(p.period)}>
                                                        <Trash2 className="size-3.5 text-muted-foreground" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* Log */}
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Log Terakhir</CardTitle></CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table className="text-xs [&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Waktu</TableHead>
                                        <TableHead>Kanal</TableHead>
                                        <TableHead>Sumber</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Baris</TableHead>
                                        <TableHead>Pesan</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Belum ada log.</TableCell></TableRow>
                                    ) : (
                                        logs.map((l) => (
                                            <TableRow key={l.id}>
                                                <TableCell className="whitespace-nowrap">{l.at}</TableCell>
                                                <TableCell><Badge variant="outline">{l.channel}</Badge></TableCell>
                                                <TableCell className="max-w-56 truncate" title={l.source}>{l.source}</TableCell>
                                                <TableCell>
                                                    <Badge variant={l.status === 'success' ? 'default' : l.status === 'failed' ? 'destructive' : 'secondary'}>{l.status}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">{l.rows === null ? '–' : num(l.rows)}</TableCell>
                                                <TableCell className="max-w-72 truncate text-muted-foreground" title={l.message ?? ''}>{l.message}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
