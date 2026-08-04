import { Can } from '@/components/can';
import InputError from '@/components/input-error';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem, type Paginated, type SharedData } from '@/types';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { type FormEventHandler, Fragment, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Sales', href: '#' },
    { title: 'Sales Daily', href: '/sales-daily' },
];

interface Item {
    // Index signature agar Item[] diterima tipe FormDataType milik useForm Inertia.
    [key: string]: string | number | undefined;
    id?: number;
    principal: string;
    item_code: string;
    product_line: string;
    description: string;
    price: number | string;
    qty: number | string;
    disc_pct: number | string;
    total?: number;
}

interface Entry {
    id: number;
    entry_date: string;
    sales_type: 'tindakan' | 'bhp' | 'unit';
    hospital_name: string;
    doctor_name: string | null;
    patient_name: string | null;
    sales_name: string | null;
    ppn_pct: number;
    total_amount: number;
    notes: string | null;
    items: (Item & { id: number; total: number })[];
    creator?: { name: string } | null;
}

interface CatalogRow {
    code: string;
    principal: string | null;
    line: string | null;
    description: string | null;
    price: number;
}

interface Props {
    month: string;
    type: string | null;
    q: string;
    entries: Paginated<Entry>;
    kpi: { entries: number; nilai: number; nilaiTindakan: number; nilaiBhp: number; nilaiUnit: number };
    options: {
        hospitals: string[];
        doctors: string[];
        salesNames: string[];
        principals: string[];
        lines: string[];
        catalog: CatalogRow[];
    };
}

const TYPE_LABEL: Record<Entry['sales_type'], string> = { tindakan: 'DTD / Tindakan', bhp: 'BHP', unit: 'Unit' };
const TYPE_BADGE: Record<Entry['sales_type'], string> = {
    tindakan: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    bhp: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    unit: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
};

const rupiah = (n: number | string) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const tglID = (v: string) => new Date(v + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

const emptyItem = (): Item => ({ principal: '', item_code: '', product_line: '', description: '', price: '', qty: 1, disc_pct: 0 });

const lineTotal = (it: Item) => (Number(it.price) || 0) * (Number(it.qty) || 0) * (1 - (Number(it.disc_pct) || 0) / 100);

// ---------- Impor Excel (diparse di sisi client, dikirim sebagai JSON) ----------

interface ImportEntry {
    entry_date: string;
    sales_type: Entry['sales_type'];
    hospital_name: string;
    doctor_name: string;
    patient_name: string;
    sales_name: string;
    notes: string;
    items: Item[];
}

const BULAN_ID: Record<string, number> = {
    januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agu: 8, ags: 8, agt: 8, sep: 9, okt: 10, nov: 11, des: 12,
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Terima sel tanggal Excel, serial number, "YYYY-MM-DD", "DD/MM/YYYY", atau "2 Juni 2026". */
const parseTanggal = (v: unknown): string | null => {
    if (v instanceof Date && !isNaN(+v)) return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
    if (typeof v === 'number' && v > 20000 && v < 60000) {
        const d = new Date(Math.round((v - 25569) * 86400000));
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (m) return `${m[3]}-${pad2(+m[2])}-${pad2(+m[1])}`;
    m = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
    if (m && BULAN_ID[m[2]]) return `${m[3]}-${pad2(BULAN_ID[m[2]])}-${pad2(+m[1])}`;
    return null;
};

/** Angka format Indonesia: "Rp4.500.000", "0,0%", "13.600.000" → number. */
const parseAngka = (v: unknown): number => {
    if (typeof v === 'number') return v;
    let s = String(v ?? '').replace(/rp/i, '').replace(/%/g, '').trim();
    if (!s || s === '-') return 0;
    s = s.replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
};

const parseTipe = (v: unknown): Entry['sales_type'] | null => {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return null;
    if (s.includes('bhp')) return 'bhp';
    if (s.includes('unit')) return 'unit';
    return 'tindakan';
};

const normH = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

const FIELD_ALIASES: Record<string, string[]> = {
    date: ['tanggal', 'tgl', 'date'],
    type: ['tipe', 'tipesales', 'type', 'salestype'],
    hospital: ['rumahsakit', 'rs', 'hospital'],
    doctor: ['dokter', 'dokteruser', 'user'],
    patient: ['pasien', 'patient'],
    sales: ['sales', 'namasales'],
    principal: ['principal'],
    code: ['kode', 'code', 'kodeitem', 'partnumber'],
    line: ['jenis', 'productline', 'line', 'system'],
    description: ['deskripsi', 'description'],
    price: ['harga', 'price', 'hargasatuan'],
    qty: ['qty', 'quantity', 'jumlah'],
    disc: ['disc', 'discount', 'diskon', 'discpct'],
    notes: ['catatan', 'notes', 'keterangan'],
};

export default function SalesDaily({ month, type, q, entries, kpi, options }: Props) {
    const { auth } = usePage<SharedData>().props;
    const [open, setOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [search, setSearch] = useState(q);
    const fileRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<{ entries: ImportEntry[]; skipped: number; itemRows: number; total: number } | null>(null);
    const [importing, setImporting] = useState(false);

    const { data, setData, post, put, processing, errors, clearErrors } = useForm<{
        entry_date: string;
        sales_type: Entry['sales_type'];
        hospital_name: string;
        doctor_name: string;
        patient_name: string;
        sales_name: string;
        notes: string;
        items: Item[];
    }>({
        entry_date: new Date().toISOString().substring(0, 10),
        sales_type: 'tindakan',
        hospital_name: '',
        doctor_name: '',
        patient_name: '',
        sales_name: auth.user?.name ?? '',
        notes: '',
        items: [emptyItem()],
    });

    const filter = (params: Record<string, string | null>) => {
        router.get(route('sales-daily.index'), { month, type: type ?? '', q, ...params }, { preserveScroll: true, preserveState: true });
    };

    const shiftMonth = (delta: number) => {
        const [y, m] = month.split('-').map(Number);
        const dt = new Date(y, m - 1 + delta, 1);
        filter({ month: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` });
    };

    const openAdd = () => {
        clearErrors();
        setData({
            entry_date: new Date().toISOString().substring(0, 10),
            sales_type: 'tindakan',
            hospital_name: '',
            doctor_name: '',
            patient_name: '',
            sales_name: auth.user?.name ?? '',
            notes: '',
            items: [emptyItem()],
        });
        setEditingId(null);
        setOpen(true);
    };

    const openEdit = (e: Entry) => {
        clearErrors();
        setData({
            entry_date: e.entry_date.substring(0, 10),
            sales_type: e.sales_type,
            hospital_name: e.hospital_name,
            doctor_name: e.doctor_name ?? '',
            patient_name: e.patient_name ?? '',
            sales_name: e.sales_name ?? '',
            notes: e.notes ?? '',
            items: e.items.map((it) => ({
                principal: it.principal ?? '',
                item_code: it.item_code ?? '',
                product_line: it.product_line ?? '',
                description: it.description ?? '',
                price: Number(it.price),
                qty: Number(it.qty),
                disc_pct: Number(it.disc_pct),
            })),
        });
        setEditingId(e.id);
        setOpen(true);
    };

    const submit: FormEventHandler = (ev) => {
        ev.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editingId) {
            put(route('sales-daily.update', editingId), opts);
        } else {
            post(route('sales-daily.store'), opts);
        }
    };

    const del = (id: number) => {
        if (confirm('Hapus input sales ini beserta seluruh barisnya?')) {
            router.delete(route('sales-daily.destroy', id), { preserveScroll: true });
        }
    };

    const setItem = (idx: number, patch: Partial<Item>) => {
        setData('items', data.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    };

    // Lookup dari Kode — CLEAR dulu lalu FILL: setiap kode berganti, deskripsi/harga/principal
    // selalu disegarkan dari katalog (harga = master produk ERP), tidak menyisakan nilai kode lama.
    const applyCatalog = (idx: number, code: string) => {
        const hit = options.catalog.find((c) => c.code.toLowerCase() === code.trim().toLowerCase());
        setItem(idx, {
            item_code: code,
            principal: hit?.principal ?? '',
            product_line: hit?.line ?? '',
            description: hit?.description ?? '',
            price: hit && hit.price > 0 ? hit.price : '',
        });
    };

    const addRow = () => setData('items', [...data.items, { ...emptyItem(), principal: data.items.at(-1)?.principal ?? '' }]);
    const removeRow = (idx: number) => setData('items', data.items.filter((_, i) => i !== idx));

    const subtotal = data.items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
    const net = data.items.reduce((s, it) => s + lineTotal(it), 0);
    const withPpn = net * 1.11;

    const toggle = (id: number) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const itemErrors = Object.keys(errors).filter((k) => k.startsWith('items'));

    // ---------- Template & impor Excel ----------

    const downloadTemplate = () => {
        const headers = ['Tanggal', 'Tipe', 'Rumah Sakit', 'Dokter (User)', 'Pasien', 'Sales', 'Principal', 'Kode', 'Jenis', 'Deskripsi', 'Harga', 'Qty', 'Disc %', 'Catatan'];
        const examples = [
            ['2026-06-02', 'DTD / Tindakan', 'Eka Hospital BSD', 'dr. Luthfi Gatam, Sp. OT (K) Spine', 'Sulasman', 'Janti', 'Globus', '1067.4745-MAP', 'Creo MIS', 'CMIS 7.5x45', 4500000, 2, 0, ''],
            ['', '', '', '', '', '', 'Globus', '1134.0010', 'Creo MIS', 'Looking Cap', 1500000, 4, 0, ''],
            ['2026-06-02', 'BHP', 'RSUP Fatmawati', 'dr. Phedy, Sp. OT (K) Spine', '', 'Lim Chandrawati', 'BONSS', 'IT16', 'Lensa', 'Cooling/Irigation Tube', 800000, 1, 0, 'Sewa Paket tindakan RF + Ablator + Set Lensa'],
            ['2026-06-08', 'Unit', 'Primaya Tangerang', 'dr. Ajiantoro, SpOT (K) Spine', '', 'Insan Setiawan', 'Medtronic', '74200001240', 'Rialto', 'Rialto Device Threaded 12x40', 13600000, 2, 0, ''],
        ];
        const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
        ws['!cols'] = headers.map((h) => ({ wch: h === 'Deskripsi' ? 40 : h === 'Dokter (User)' || h === 'Rumah Sakit' ? 30 : Math.max(10, h.length + 2) }));

        const notes = [
            ['Kolom', 'Wajib?', 'Keterangan'],
            ['Tanggal', 'Ya', 'Format sel tanggal Excel, atau teks: 2026-06-02 / 02/06/2026 / "2 Juni 2026"'],
            ['Tipe', 'Opsional', 'DTD / Tindakan, BHP, atau Unit. Kosong → mengikuti baris di atasnya (awal file: Tindakan)'],
            ['Rumah Sakit', 'Ya', 'Nama RS'],
            ['Dokter (User)', 'Opsional', 'Dokter pengguna produk'],
            ['Pasien', 'Opsional', 'Hanya dipakai untuk tipe DTD / Tindakan (BHP & Unit diabaikan)'],
            ['Sales', 'Opsional', 'Nama sales'],
            ['Principal / Kode / Jenis / Deskripsi', '—', 'Identitas item. Baris tanpa Kode DAN Deskripsi akan dilewati'],
            ['Harga / Qty / Disc %', '—', 'Angka. Format "Rp4.500.000" dan "0,0%" juga dikenali'],
            ['', '', ''],
            ['Cara kerja', '', '1 baris = 1 item. Baris berurutan dengan Tanggal+Tipe+RS+Dokter+Pasien+Sales yang sama digabung menjadi 1 transaksi.'],
            ['', '', 'Kolom Tanggal s/d Sales boleh dikosongkan di baris lanjutan item — otomatis mengikuti baris di atasnya.'],
            ['', '', 'PPN 11% dihitung otomatis oleh sistem, tidak perlu kolom PPN.'],
        ];
        const wsNotes = XLSX.utils.aoa_to_sheet(notes);
        wsNotes['!cols'] = [{ wch: 34 }, { wch: 10 }, { wch: 88 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        XLSX.utils.book_append_sheet(wb, wsNotes, 'Petunjuk');
        XLSX.writeFile(wb, 'template-sales-daily.xlsx');
    };

    const onImportFile = async (file: File) => {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (!raw.length) {
            alert('Sheet kosong.');
            return;
        }

        // Petakan header sheet → field (toleran terhadap variasi nama kolom).
        const col: Record<string, string> = {};
        for (const key of Object.keys(raw[0])) {
            const nk = normH(key);
            for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
                if (col[field] === undefined && aliases.includes(nk)) col[field] = key;
            }
        }
        if (col.date === undefined || col.hospital === undefined) {
            alert('Kolom "Tanggal" dan/atau "Rumah Sakit" tidak ditemukan di sheet.\nGunakan template (tombol Template) sebagai acuan nama kolom.');
            return;
        }

        const val = (rec: Record<string, unknown>, f: string) => (col[f] !== undefined ? rec[col[f]] : '');
        const str = (rec: Record<string, unknown>, f: string) => String(val(rec, f) ?? '').trim();

        const entries: ImportEntry[] = [];
        let skipped = 0;
        let lastKey = '';
        const carry: { date: string; type: Entry['sales_type']; hospital: string; doctor: string; patient: string; sales: string } = {
            date: '', type: 'tindakan', hospital: '', doctor: '', patient: '', sales: '',
        };

        for (const rec of raw) {
            const code = str(rec, 'code');
            const desc = str(rec, 'description');
            const rowIsEmpty = Object.values(rec).every((c) => String(c ?? '').trim() === '' || parseAngka(c) === 0);
            if (code === '' && desc === '') {
                if (!rowIsEmpty) skipped++; // ada isi tapi tak bisa dikenali sebagai item
                continue;
            }

            const date: string = parseTanggal(val(rec, 'date')) ?? carry.date;
            const hospital: string = str(rec, 'hospital') || carry.hospital;
            if (!date || !hospital) {
                skipped++;
                continue;
            }
            const rowType: Entry['sales_type'] = parseTipe(val(rec, 'type')) ?? carry.type;
            // Baris lanjutan (RS kosong) mewarisi dokter/pasien baris di atasnya; baris yang
            // menulis RS baru dianggap header baru — dokter/pasien kosong berarti memang kosong.
            const doctor: string = str(rec, 'doctor') || (str(rec, 'hospital') ? '' : carry.doctor);
            const patient: string = rowType === 'tindakan' ? str(rec, 'patient') || (str(rec, 'hospital') ? '' : carry.patient) : '';
            const sales: string = str(rec, 'sales') || carry.sales;
            Object.assign(carry, { date, type: rowType, hospital, doctor, patient, sales });

            const qtyRaw = String(val(rec, 'qty') ?? '').trim();
            const item: Item = {
                principal: str(rec, 'principal'),
                item_code: code,
                product_line: str(rec, 'line'),
                description: desc,
                price: parseAngka(val(rec, 'price')),
                qty: qtyRaw === '' ? 1 : parseAngka(val(rec, 'qty')),
                disc_pct: Math.min(100, Math.max(0, parseAngka(val(rec, 'disc')))),
            };

            const key = [date, rowType, hospital, doctor, patient, sales].join('|');
            if (key === lastKey && entries.length > 0) {
                entries[entries.length - 1].items.push(item);
            } else {
                entries.push({
                    entry_date: date,
                    sales_type: rowType,
                    hospital_name: hospital,
                    doctor_name: doctor,
                    patient_name: patient,
                    sales_name: sales,
                    notes: str(rec, 'notes'),
                    items: [item],
                });
                lastKey = key;
            }
        }

        if (fileRef.current) fileRef.current.value = '';
        if (!entries.length) {
            alert('Tidak ada baris valid yang bisa diimpor. Pastikan kolom Tanggal, Rumah Sakit, dan Kode/Deskripsi terisi.');
            return;
        }
        if (entries.length > 500) {
            alert(`Terlalu banyak transaksi dalam satu file (${entries.length}). Maksimal 500 — pecah file lalu impor bertahap.`);
            return;
        }

        const itemRows = entries.reduce((s, e) => s + e.items.length, 0);
        const total = entries.reduce((s, e) => s + e.items.reduce((t, it) => t + lineTotal(it), 0), 0);
        setPreview({ entries, skipped, itemRows, total });
    };

    const doImport = () => {
        if (!preview) return;
        setImporting(true);
        router.post(route('sales-daily.import'), { entries: preview.entries } as unknown as Record<string, never>, {
            preserveScroll: true,
            onSuccess: () => setPreview(null),
            onError: (errs) => alert('Impor ditolak server:\n' + Object.values(errs).slice(0, 5).join('\n')),
            onFinish: () => setImporting(false),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Sales Daily" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">Sales Daily</h1>
                        <p className="text-sm text-muted-foreground">Input data penjualan harian oleh tim sales.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center rounded-md border">
                            <Button variant="ghost" size="icon" className="size-8 rounded-r-none" onClick={() => shiftMonth(-1)}>
                                <ChevronLeft className="size-4" />
                            </Button>
                            <span className="px-2 text-sm font-medium">{month}</span>
                            <Button variant="ghost" size="icon" className="size-8 rounded-l-none" onClick={() => shiftMonth(1)}>
                                <ChevronRight className="size-4" />
                            </Button>
                        </div>
                        <Select value={type ?? 'all'} onValueChange={(v) => filter({ type: v === 'all' ? '' : v })}>
                            <SelectTrigger className="h-9 w-[150px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua Tipe</SelectItem>
                                <SelectItem value="tindakan">DTD / Tindakan</SelectItem>
                                <SelectItem value="bhp">BHP</SelectItem>
                                <SelectItem value="unit">Unit</SelectItem>
                            </SelectContent>
                        </Select>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                filter({ q: search });
                            }}
                            className="relative"
                        >
                            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari RS / dokter / kode…" className="h-9 w-52 pl-8" />
                        </form>
                        <Can on="sales-daily" do="create">
                            <Button variant="outline" onClick={downloadTemplate} title="Unduh template Excel">
                                <Download className="size-4" /> Template
                            </Button>
                            <Button variant="outline" onClick={() => fileRef.current?.click()}>
                                <Upload className="size-4" /> Impor Excel
                            </Button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) void onImportFile(f);
                                }}
                            />
                            <Button onClick={openAdd}>
                                <Plus className="size-4" /> Input Sales
                            </Button>
                        </Can>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-xs text-muted-foreground">Total Nilai (sebelum PPN)</div>
                            <div className="text-2xl font-semibold">{rupiah(kpi.nilai)}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-xs text-muted-foreground">Transaksi Bulan Ini</div>
                            <div className="text-2xl font-semibold">{kpi.entries}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="space-y-1 py-4 text-xs">
                            <div className="flex justify-between"><span className="text-muted-foreground">DTD / Tindakan</span><span className="font-medium">{rupiah(kpi.nilaiTindakan)}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">BHP</span><span className="font-medium">{rupiah(kpi.nilaiBhp)}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Unit</span><span className="font-medium">{rupiah(kpi.nilaiUnit)}</span></div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table className="min-w-full text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8" />
                                        <TableHead>Tanggal</TableHead>
                                        <TableHead>Tipe</TableHead>
                                        <TableHead>Rumah Sakit</TableHead>
                                        <TableHead>Dokter</TableHead>
                                        <TableHead>Pasien</TableHead>
                                        <TableHead>Sales</TableHead>
                                        <TableHead className="text-right">Item</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead className="text-right">Total + PPN</TableHead>
                                        <TableHead className="text-right">Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {entries.data.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                                                Belum ada input sales untuk filter ini.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        entries.data.map((e) => (
                                            <Fragment key={e.id}>
                                                <TableRow className="cursor-pointer" onClick={() => toggle(e.id)}>
                                                    <TableCell>
                                                        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', expanded.has(e.id) && 'rotate-180')} />
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">{tglID(e.entry_date.substring(0, 10))}</TableCell>
                                                    <TableCell>
                                                        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', TYPE_BADGE[e.sales_type])}>
                                                            {TYPE_LABEL[e.sales_type]}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>{e.hospital_name}</TableCell>
                                                    <TableCell className="max-w-52 truncate">{e.doctor_name ?? '—'}</TableCell>
                                                    <TableCell>{e.sales_type === 'tindakan' ? (e.patient_name ?? '—') : '—'}</TableCell>
                                                    <TableCell>{e.sales_name ?? '—'}</TableCell>
                                                    <TableCell className="text-right">{e.items.length}</TableCell>
                                                    <TableCell className="text-right whitespace-nowrap">{rupiah(e.total_amount)}</TableCell>
                                                    <TableCell className="text-right whitespace-nowrap">{rupiah(e.total_amount * (1 + e.ppn_pct / 100))}</TableCell>
                                                    <TableCell className="text-right" onClick={(ev) => ev.stopPropagation()}>
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Can on="sales-daily" do="edit">
                                                                <Button variant="ghost" size="icon" onClick={() => openEdit(e)}>
                                                                    <Pencil className="size-4" />
                                                                </Button>
                                                            </Can>
                                                            <Can on="sales-daily" do="delete">
                                                                <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => del(e.id)}>
                                                                    <Trash2 className="size-4" />
                                                                </Button>
                                                            </Can>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                                {expanded.has(e.id) && (
                                                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                                                        <TableCell colSpan={11} className="p-0">
                                                            <div className="overflow-x-auto px-6 py-3">
                                                                <table className="w-full text-xs">
                                                                    <thead className="text-muted-foreground">
                                                                        <tr className="[&>th]:py-1 [&>th]:pr-4 [&>th]:text-left [&>th]:font-medium">
                                                                            <th>Principal</th>
                                                                            <th>Kode</th>
                                                                            <th>Jenis</th>
                                                                            <th>Deskripsi</th>
                                                                            <th className="!text-right">Harga</th>
                                                                            <th className="!text-right">Qty</th>
                                                                            <th className="!text-right">Disc</th>
                                                                            <th className="!text-right">Total</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {e.items.map((it) => (
                                                                            <tr key={it.id} className="border-t [&>td]:py-1 [&>td]:pr-4">
                                                                                <td>{it.principal || '—'}</td>
                                                                                <td className="font-mono">{it.item_code || '—'}</td>
                                                                                <td>{it.product_line || '—'}</td>
                                                                                <td>{it.description || '—'}</td>
                                                                                <td className="text-right whitespace-nowrap">{rupiah(it.price)}</td>
                                                                                <td className="text-right">{Number(it.qty)}</td>
                                                                                <td className="text-right">{Number(it.disc_pct)}%</td>
                                                                                <td className="text-right whitespace-nowrap">{rupiah(it.total)}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                                {e.notes && <p className="mt-2 text-xs text-muted-foreground">Catatan: {e.notes}</p>}
                                                                {e.creator && <p className="mt-1 text-[11px] text-muted-foreground">Diinput oleh {e.creator.name}</p>}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </Fragment>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Pagination links={entries.links} />
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[95vh] w-[98vw] !max-w-[88rem] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingId ? 'Ubah Input Sales' : 'Input Sales Harian'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-4">
                            <div className="grid gap-2">
                                <Label htmlFor="sd_date">Tanggal *</Label>
                                <Input id="sd_date" type="date" value={data.entry_date} onChange={(e) => setData('entry_date', e.target.value)} required />
                                <InputError message={errors.entry_date} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Tipe Sales *</Label>
                                <Select value={data.sales_type} onValueChange={(v) => setData('sales_type', v as Entry['sales_type'])}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="tindakan">DTD / Tindakan</SelectItem>
                                        <SelectItem value="bhp">BHP</SelectItem>
                                        <SelectItem value="unit">Unit</SelectItem>
                                    </SelectContent>
                                </Select>
                                <InputError message={errors.sales_type} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="sd_hospital">Rumah Sakit *</Label>
                                <Input id="sd_hospital" list="sd-hospitals" value={data.hospital_name} onChange={(e) => setData('hospital_name', e.target.value)} required />
                                <InputError message={errors.hospital_name} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="sd_doctor">Dokter (User)</Label>
                                <Input id="sd_doctor" list="sd-doctors" value={data.doctor_name} onChange={(e) => setData('doctor_name', e.target.value)} placeholder="mis. dr. Phedy, Sp. OT (K) Spine" />
                                <InputError message={errors.doctor_name} />
                            </div>
                            {data.sales_type === 'tindakan' && (
                                <div className="grid gap-2">
                                    <Label htmlFor="sd_patient">Pasien</Label>
                                    <Input id="sd_patient" value={data.patient_name} onChange={(e) => setData('patient_name', e.target.value)} />
                                    <InputError message={errors.patient_name} />
                                </div>
                            )}
                            <div className="grid gap-2">
                                <Label htmlFor="sd_sales">Sales</Label>
                                <Input id="sd_sales" list="sd-sales" value={data.sales_name} onChange={(e) => setData('sales_name', e.target.value)} />
                                <InputError message={errors.sales_name} />
                            </div>
                            <div className={cn('grid gap-2', data.sales_type === 'tindakan' ? 'sm:col-span-3 xl:col-span-2' : 'sm:col-span-2 xl:col-span-3')}>
                                <Label htmlFor="sd_notes">Catatan</Label>
                                <Input id="sd_notes" value={data.notes} onChange={(e) => setData('notes', e.target.value)} placeholder="opsional — mis. sewa paket tindakan RF + Ablator" />
                            </div>
                        </div>

                        {/* Principal & Jenis tidak ditampilkan — terisi otomatis dari lookup Kode. */}
                        <div className="rounded-md border">
                            {/* Desktop: tabel */}
                            <div className="hidden overflow-x-auto md:block">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                                        <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                                            <th className="w-44">Kode</th>
                                            <th>Deskripsi</th>
                                            <th className="w-32 !text-right">Harga</th>
                                            <th className="w-20 !text-right">Qty</th>
                                            <th className="w-20 !text-right">Disc %</th>
                                            <th className="w-32 !text-right">Total</th>
                                            <th className="w-8" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.items.map((it, i) => (
                                            <tr key={i} className="border-t align-top [&>td]:px-2 [&>td]:py-1.5">
                                                <td>
                                                    <Input list="sd-codes" className="h-8 font-mono" value={it.item_code} onChange={(e) => applyCatalog(i, e.target.value)} />
                                                </td>
                                                <td>
                                                    <Input className="h-8" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                                                </td>
                                                <td>
                                                    <Input type="number" min={0} step="any" className="h-8 text-right" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} />
                                                </td>
                                                <td>
                                                    <Input type="number" min={0} step="any" className="h-8 text-right" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} />
                                                </td>
                                                <td>
                                                    <Input type="number" min={0} max={100} step="any" className="h-8 text-right" value={it.disc_pct} onChange={(e) => setItem(i, { disc_pct: e.target.value })} />
                                                </td>
                                                <td className="pt-3 text-right text-xs whitespace-nowrap">
                                                    {rupiah(lineTotal(it))}
                                                    {it.principal && <div className="text-[10px] font-normal text-muted-foreground">{it.principal}</div>}
                                                </td>
                                                <td className="pt-1.5">
                                                    <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground" disabled={data.items.length <= 1} onClick={() => removeRow(i)}>
                                                        <X className="size-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile: bertumpuk seperti field header */}
                            <div className="divide-y md:hidden">
                                {data.items.map((it, i) => (
                                    <div key={i} className="grid grid-cols-3 gap-3 p-3">
                                        <div className="col-span-3 flex items-center justify-between">
                                            <span className="text-xs font-medium text-muted-foreground">
                                                Item {i + 1}
                                                {it.principal ? ` · ${it.principal}` : ''}
                                            </span>
                                            <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground" disabled={data.items.length <= 1} onClick={() => removeRow(i)}>
                                                <X className="size-4" />
                                            </Button>
                                        </div>
                                        <div className="col-span-3 grid gap-1.5">
                                            <Label className="text-xs">Kode</Label>
                                            <Input list="sd-codes" className="h-9 font-mono" value={it.item_code} onChange={(e) => applyCatalog(i, e.target.value)} />
                                        </div>
                                        <div className="col-span-3 grid gap-1.5">
                                            <Label className="text-xs">Deskripsi</Label>
                                            <Input className="h-9" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label className="text-xs">Harga</Label>
                                            <Input type="number" min={0} step="any" className="h-9 text-right" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} />
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label className="text-xs">Qty</Label>
                                            <Input type="number" min={0} step="any" className="h-9 text-right" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} />
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label className="text-xs">Disc %</Label>
                                            <Input type="number" min={0} max={100} step="any" className="h-9 text-right" value={it.disc_pct} onChange={(e) => setItem(i, { disc_pct: e.target.value })} />
                                        </div>
                                        <div className="col-span-3 text-right text-sm">
                                            Total: <b>{rupiah(lineTotal(it))}</b>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2">
                                <Button type="button" variant="outline" size="sm" onClick={addRow}>
                                    <Plus className="size-4" /> Tambah Baris
                                </Button>
                                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                                    <span className="text-muted-foreground">
                                        Subtotal: <b className="text-foreground">{rupiah(subtotal)}</b>
                                    </span>
                                    <span className="text-muted-foreground">
                                        Diskon: <b className="text-foreground">{rupiah(subtotal - net)}</b>
                                    </span>
                                    <span className="text-muted-foreground">
                                        Total: <b className="text-foreground">{rupiah(net)}</b>
                                    </span>
                                    <span className="text-muted-foreground">
                                        Total + PPN 11%: <b className="text-foreground">{rupiah(withPpn)}</b>
                                    </span>
                                </div>
                            </div>
                        </div>
                        {itemErrors.length > 0 && <InputError message={errors[itemErrors[0] as keyof typeof errors] as string} />}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Batal
                            </Button>
                            <Button type="submit" disabled={processing}>
                                Simpan
                            </Button>
                        </DialogFooter>
                    </form>

                    <datalist id="sd-hospitals">
                        {options.hospitals.map((h) => (
                            <option key={h} value={h} />
                        ))}
                    </datalist>
                    <datalist id="sd-doctors">
                        {options.doctors.map((d) => (
                            <option key={d} value={d} />
                        ))}
                    </datalist>
                    <datalist id="sd-sales">
                        {options.salesNames.map((s) => (
                            <option key={s} value={s} />
                        ))}
                    </datalist>
                    <datalist id="sd-codes">
                        {options.catalog.map((c) => (
                            <option key={c.code} value={c.code}>
                                {c.description ?? ''}
                            </option>
                        ))}
                    </datalist>
                </DialogContent>
            </Dialog>

            {/* Preview impor Excel — konfirmasi dulu sebelum disimpan */}
            <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
                <DialogContent className="max-h-[90vh] w-[95vw] !max-w-4xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Preview Impor Excel</DialogTitle>
                    </DialogHeader>
                    {preview && (
                        <div className="grid gap-3">
                            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                                Terbaca <b>{preview.entries.length} transaksi</b> ({preview.itemRows} baris item), total nilai <b>{rupiah(preview.total)}</b> (sebelum PPN).
                                {preview.skipped > 0 && (
                                    <span className="text-amber-600 dark:text-amber-400"> {preview.skipped} baris dilewati (tanpa tanggal/RS/identitas item).</span>
                                )}
                            </div>
                            <div className="max-h-[50vh] overflow-auto rounded-md border">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-muted text-muted-foreground">
                                        <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                                            <th>Tanggal</th>
                                            <th>Tipe</th>
                                            <th>Rumah Sakit</th>
                                            <th>Dokter</th>
                                            <th>Pasien</th>
                                            <th>Sales</th>
                                            <th className="!text-right">Item</th>
                                            <th className="!text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.entries.slice(0, 100).map((e, i) => (
                                            <tr key={i} className="border-t [&>td]:px-2 [&>td]:py-1">
                                                <td className="whitespace-nowrap">{e.entry_date}</td>
                                                <td>
                                                    <span className={cn('rounded px-1 py-0.5 text-[10px] font-medium whitespace-nowrap', TYPE_BADGE[e.sales_type])}>
                                                        {TYPE_LABEL[e.sales_type]}
                                                    </span>
                                                </td>
                                                <td>{e.hospital_name}</td>
                                                <td className="max-w-44 truncate">{e.doctor_name || '—'}</td>
                                                <td>{e.sales_type === 'tindakan' ? e.patient_name || '—' : '—'}</td>
                                                <td>{e.sales_name || '—'}</td>
                                                <td className="text-right">{e.items.length}</td>
                                                <td className="text-right whitespace-nowrap">{rupiah(e.items.reduce((t, it) => t + lineTotal(it), 0))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {preview.entries.length > 100 && (
                                    <p className="px-2 py-1.5 text-xs text-muted-foreground">…dan {preview.entries.length - 100} transaksi lagi.</p>
                                )}
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setPreview(null)}>
                                    Batal
                                </Button>
                                <Button type="button" onClick={doImport} disabled={importing}>
                                    <Upload className="size-4" /> Impor {preview.entries.length} Transaksi
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
