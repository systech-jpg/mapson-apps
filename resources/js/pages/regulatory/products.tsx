import { Can } from '@/components/can';
import InputError from '@/components/input-error';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem, type Paginated } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { ChevronRight, Download, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { type FormEventHandler, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Regulatory', href: '#' },
    { title: 'Registrasi Produk', href: '/regulatory/products' },
];

// Cermin dari RegulatoryRegistrationController::LICENSE_HOLDERS (hardcode sementara;
// nanti diganti lookup third party ERP ber-flag license holder).
export const LICENSE_HOLDERS = ['PT. Mapson Arya Parahita', 'PT. Asia Actual', 'PT. Dwipa', 'PT. Medtronic Indonesia'];

export interface Registration {
    id: number;
    akl_number: string;
    product_name: string;
    manufacturer: string | null;
    license_holder: string | null;
    risk_class: string | null;
    category: string | null;
    sub_category: string | null;
    product_type: string | null;
    application_type: string | null;
    issued_date: string | null;
    expired_date: string | null;
    notes: string | null;
    products_count?: number;
}

interface Props {
    q: string;
    status: string;
    registrations: Paginated<Registration>;
    kpi: { total: number; items: number; expiring: number; expired: number };
    expiringDays: number;
    erpError: string | null;
}

export const tglID = (v: string | null) => (v ? new Date(v.substring(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export type RegStatus = 'expired' | 'expiring' | 'active' | 'nodate';

export const regStatus = (r: Pick<Registration, 'expired_date'>, expiringDays: number): RegStatus => {
    if (!r.expired_date) return 'nodate';
    const exp = new Date(r.expired_date.substring(0, 10) + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (exp < today) return 'expired';
    if (exp <= new Date(today.getTime() + expiringDays * 86400000)) return 'expiring';
    return 'active';
};

export const STATUS_BADGE: Record<RegStatus, { label: string; cls: string }> = {
    active: { label: 'Aktif', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
    expiring: { label: 'Segera Habis', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
    expired: { label: 'Kedaluwarsa', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
    nodate: { label: 'Tanpa Tgl', cls: 'bg-muted text-muted-foreground' },
};

// ---------- Form header izin (dipakai halaman list & detail) ----------

export interface RegForm {
    // Index signature agar diterima tipe FormDataType milik useForm Inertia.
    [key: string]: string;
    akl_number: string;
    product_name: string;
    manufacturer: string;
    license_holder: string;
    risk_class: string;
    category: string;
    sub_category: string;
    product_type: string;
    application_type: string;
    issued_date: string;
    expired_date: string;
    notes: string;
}

export const emptyRegForm = (): RegForm => ({
    akl_number: '', product_name: '', manufacturer: '', license_holder: LICENSE_HOLDERS[0], risk_class: '', category: '', sub_category: '',
    product_type: '', application_type: '', issued_date: '', expired_date: '', notes: '',
});

export const regToForm = (r: Registration): RegForm => ({
    akl_number: r.akl_number,
    product_name: r.product_name,
    manufacturer: r.manufacturer ?? '',
    license_holder: r.license_holder ?? '',
    risk_class: r.risk_class ?? '',
    category: r.category ?? '',
    sub_category: r.sub_category ?? '',
    product_type: r.product_type ?? '',
    application_type: r.application_type ?? '',
    issued_date: r.issued_date ? r.issued_date.substring(0, 10) : '',
    expired_date: r.expired_date ? r.expired_date.substring(0, 10) : '',
    notes: r.notes ?? '',
});

export function RegHeaderFields({ data, setData, errors }: {
    data: RegForm;
    setData: (key: keyof RegForm, value: string) => void;
    errors: Partial<Record<string, string>>;
}) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-2">
                <Label htmlFor="r_akl">No. Izin Edar (AKL) *</Label>
                <Input id="r_akl" className="font-mono" value={data.akl_number} onChange={(e) => setData('akl_number', e.target.value)} placeholder="AKL 21302220256" required />
                <InputError message={errors.akl_number} />
            </div>
            <div className="grid gap-2 lg:col-span-2">
                <Label htmlFor="r_name">Nama Produk *</Label>
                <Input id="r_name" value={data.product_name} onChange={(e) => setData('product_name', e.target.value)} required />
                <InputError message={errors.product_name} />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="r_manu">Produsen / Principle</Label>
                <Input id="r_manu" value={data.manufacturer} onChange={(e) => setData('manufacturer', e.target.value)} />
                <InputError message={errors.manufacturer} />
            </div>
            <div className="grid gap-2">
                <Label>License Holder (Pemegang Izin)</Label>
                <Select value={data.license_holder || 'unset'} onValueChange={(v) => setData('license_holder', v === 'unset' ? '' : v)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="unset">— tidak diisi —</SelectItem>
                        {LICENSE_HOLDERS.map((h) => (
                            <SelectItem key={h} value={h}>
                                {h}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <InputError message={errors.license_holder} />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="r_risk">Kelas Resiko</Label>
                <Input id="r_risk" value={data.risk_class} onChange={(e) => setData('risk_class', e.target.value)} placeholder="mis. Non Elektromedik Non Steril / C" />
                <InputError message={errors.risk_class} />
            </div>
            <div className="grid gap-2">
                <Label>Jenis Permohonan</Label>
                <Select value={data.application_type || 'unset'} onValueChange={(v) => setData('application_type', v === 'unset' ? '' : v)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="unset">— tidak diisi —</SelectItem>
                        <SelectItem value="Permohonan Baru">Permohonan Baru</SelectItem>
                        <SelectItem value="Perubahan">Perubahan</SelectItem>
                        <SelectItem value="Perpanjangan">Perpanjangan</SelectItem>
                        <SelectItem value="Perpanjangan dengan Perubahan">Perpanjangan dengan Perubahan</SelectItem>
                    </SelectContent>
                </Select>
                <InputError message={errors.application_type} />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="r_cat">Kategori Produk</Label>
                <Input id="r_cat" value={data.category} onChange={(e) => setData('category', e.target.value)} placeholder="mis. Peralatan Ortopedi" />
                <InputError message={errors.category} />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="r_sub">Sub Kategori</Label>
                <Input id="r_sub" value={data.sub_category} onChange={(e) => setData('sub_category', e.target.value)} />
                <InputError message={errors.sub_category} />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="r_ptype">Jenis Produk</Label>
                <Input id="r_ptype" value={data.product_type} onChange={(e) => setData('product_type', e.target.value)} />
                <InputError message={errors.product_type} />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="r_issued">Tgl Terbit</Label>
                <Input id="r_issued" type="date" value={data.issued_date} onChange={(e) => setData('issued_date', e.target.value)} />
                <InputError message={errors.issued_date} />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="r_expired">Tgl Expired</Label>
                <Input id="r_expired" type="date" value={data.expired_date} onChange={(e) => setData('expired_date', e.target.value)} />
                <InputError message={errors.expired_date} />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="r_notes">Catatan</Label>
                <Input id="r_notes" value={data.notes} onChange={(e) => setData('notes', e.target.value)} />
            </div>
        </div>
    );
}

// ---------- Impor Excel ----------

interface ImportReg {
    akl_number: string;
    product_name: string;
    manufacturer: string;
    license_holder: string;
    risk_class: string;
    category: string;
    sub_category: string;
    product_type: string;
    application_type: string;
    issued_date: string;
    expired_date: string;
    items: { item_code: string; description: string }[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

const BULAN: Record<string, number> = {
    januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
    agu: 8, ags: 8, agt: 8, okt: 10, des: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Terima sel tanggal Excel, serial, "YYYY-MM-DD", "DD/MM/YYYY", "3-May-26", "23 Mei 2026". */
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
    m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
    if (m) return `${m[3]}-${pad2(+m[2])}-${pad2(+m[1])}`;
    m = s.match(/^(\d{1,2})[-\s]([a-z]+)[-\s](\d{2,4})$/);
    if (m && BULAN[m[2]]) {
        const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
        return `${y}-${pad2(BULAN[m[2]])}-${pad2(+m[1])}`;
    }
    return null;
};

const normH = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

const FIELD_ALIASES: Record<string, string[]> = {
    akl: ['noakl', 'nomorakl', 'akl', 'nomorizinedar', 'noizinedar'],
    name: ['namaproduk', 'namaprodukbasedonakl', 'productname'],
    manufacturer: ['produsen', 'principle', 'principal', 'manufacturer'],
    holder: ['licenseholder', 'pemegangizin', 'pemegangizinedar'],
    risk: ['kelasresiko', 'kelasrisiko', 'riskclass'],
    category: ['kategoriproduk', 'kategori', 'category'],
    subcategory: ['subkategori', 'subcategory'],
    ptype: ['jenisproduk', 'producttype'],
    apptype: ['jenispermohonan', 'applicationtype'],
    issued: ['tglterbit', 'tglterbitakl', 'tanggalterbit', 'issueddate'],
    expired: ['tglexpired', 'tglexpakl', 'tglexp', 'tanggalexpired', 'expireddate'],
    code: ['kode', 'code', 'kodeproduk'],
    description: ['deskripsi', 'description'],
};

export default function RegulatoryProducts({ q, status, registrations, kpi, expiringDays, erpError }: Props) {
    const [search, setSearch] = useState(q);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Registration | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<{ regs: ImportReg[]; skipped: number; itemRows: number } | null>(null);
    const [importing, setImporting] = useState(false);

    const { data, setData, post, put, processing, errors, clearErrors } = useForm<RegForm>(emptyRegForm());

    const filter = (params: Record<string, string>) => {
        router.get(route('regulatory-products.index'), { q, status, ...params }, { preserveScroll: true, preserveState: true });
    };

    const openAdd = () => {
        clearErrors();
        setData({ ...emptyRegForm(), application_type: 'Permohonan Baru' });
        setEditing(null);
        setOpen(true);
    };

    const openEdit = (r: Registration) => {
        clearErrors();
        setData(regToForm(r));
        setEditing(r);
        setOpen(true);
    };

    const submit: FormEventHandler = (ev) => {
        ev.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) {
            put(route('regulatory-products.update', editing.id), opts);
        } else {
            post(route('regulatory-products.store'), opts);
        }
    };

    const del = (r: Registration) => {
        if (confirm(`Hapus registrasi ${r.akl_number}? (tag produk di ERP tidak disentuh)`)) {
            router.delete(route('regulatory-products.destroy', r.id), { preserveScroll: true });
        }
    };

    // ---------- Template & impor ----------

    // Tiga varian template: gabungan, daftar izin saja, list produk saja — semuanya
    // diimpor lewat tombol Impor Excel yang sama (parser mengenali kolom yang ada).
    const downloadTemplate = (kind: 'full' | 'izin' | 'produk') => {
        const HEAD_IZIN = ['No. AKL', 'Nama Produk', 'Produsen', 'License Holder', 'Kelas Resiko', 'Kategori Produk', 'Sub Kategori', 'Jenis Produk', 'Jenis Permohonan', 'Tgl Terbit', 'Tgl Expired'];
        const ROW_ZENIUS = ['AKL 21302220256', 'ZENIUS Spinal System', 'MEDYSSEY CO., LTD., Korea', 'PT. Mapson Arya Parahita', 'Non Elektromedik Non Steril / C', 'Peralatan Ortopedi', 'Peralatan Ortopedi Prostetik', 'Spinal intervertebral body fixation orthosis', 'Perpanjangan dengan Perubahan', '2024-05-29', '2029-02-14'];
        const ROW_TIROBOT = ['AKL 21303520437', 'TIROBOT ForcePro Superior', 'TINAVI MEDICAL TECHNOLOGIES CO., LTD', 'PT. Mapson Arya Parahita', 'Elektromedik Non Radiasi / B', 'Peralatan Ortopedi', 'Peralatan Ortopedi Bedah', 'Surgical robot', 'Permohonan Baru', '2026-02-02', '2030-07-06'];

        let headers: string[];
        let examples: (string | number)[][];
        let filename: string;
        const notes: string[][] = [['Kolom', 'Wajib?', 'Keterangan']];

        if (kind === 'izin') {
            headers = HEAD_IZIN;
            examples = [ROW_ZENIUS, ROW_TIROBOT];
            filename = 'template-daftar-izin-akl.xlsx';
            notes.push(
                ['No. AKL', 'Ya', '1 baris = 1 izin edar'],
                ['Nama Produk', 'Ya', 'Nama produk sesuai izin (based on AKL)'],
                ['License Holder', 'Opsional', `Pemegang izin — salah satu dari: ${LICENSE_HOLDERS.join(' / ')}`],
                ['Tgl Terbit & Tgl Expired', 'Opsional', 'Format sel tanggal Excel, 2026-02-02, 02/02/2026, atau 3-May-26'],
                ['', '', ''],
                ['Catatan', '', 'List produk bisa diimpor terpisah pakai Template List Produk — cukup No. AKL + Kode + Deskripsi.'],
            );
        } else if (kind === 'produk') {
            headers = ['No. AKL', 'Kode', 'Deskripsi'];
            examples = [
                ['AKL 21302220256', 'SXCP5545', 'Long Reduction Poly Screw 5.5x45'],
                ['', 'ZA100', 'Set Screw, Ø 10.0mm'],
                ['', 'ITR55060', 'Titanium Taper Rod 5.5 x 60'],
                ['AKL 21303520437', 'GL5', 'Guidance'],
                ['', 'TR1-8873', 'Patient Tracker'],
            ];
            filename = 'template-list-produk-akl.xlsx';
            notes.push(
                ['No. AKL', 'Ya', 'Harus SUDAH terdaftar di aplikasi (impor daftar izin dulu). Boleh dikosongkan di baris lanjutan — mengikuti baris di atasnya'],
                ['Kode', 'Ya', 'Ref produk di ERP. Saat impor, No. AKL DITULIS ke produk ERP tersebut'],
                ['Deskripsi', 'Opsional', 'Deskripsi resmi lampiran AKL — dipakai pembanding deskripsi ERP vs AKL'],
                ['', '', ''],
                ['Catatan', '', 'No. AKL yang belum terdaftar dilaporkan & dilewati. Kode yang tak ada di produk ERP juga dilaporkan.'],
            );
        } else {
            headers = [...HEAD_IZIN, 'Kode', 'Deskripsi'];
            examples = [
                [...ROW_ZENIUS, 'SXCP5545', 'Long Reduction Poly Screw 5.5x45'],
                ['', '', '', '', '', '', '', '', '', '', '', 'ZA100', 'Set Screw, Ø 10.0mm'],
                [...ROW_TIROBOT, 'GL5', 'Guidance'],
            ];
            filename = 'template-registrasi-produk.xlsx';
            notes.push(
                ['No. AKL', 'Ya', 'Nomor izin edar. Baris dengan No. AKL sama & berurutan digabung jadi satu registrasi'],
                ['Nama Produk', 'Ya', 'Nama produk sesuai izin (based on AKL)'],
                ['License Holder', 'Opsional', `Pemegang izin — salah satu dari: ${LICENSE_HOLDERS.join(' / ')}`],
                ['Tgl Terbit & Tgl Expired', 'Opsional', 'Format sel tanggal Excel, 2026-02-02, 02/02/2026, atau 3-May-26'],
                ['Kode', 'Opsional', 'Ref produk di ERP. Saat impor, No. AKL DITULIS ke produk ERP tersebut'],
                ['', '', ''],
                ['Catatan', '', 'Kode yang tidak ditemukan di produk ERP dilaporkan & dilewati (produk tidak dibuat otomatis).'],
                ['', '', 'Impor tidak melepas tag produk lain yang sudah ada — hanya menambah/memindah tag kode yang disebut.'],
            );
        }

        const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
        ws['!cols'] = headers.map((h) => ({ wch: h === 'Deskripsi' || h === 'Jenis Produk' ? 40 : Math.max(12, h.length + 2) }));
        const wsNotes = XLSX.utils.aoa_to_sheet(notes);
        wsNotes['!cols'] = [{ wch: 42 }, { wch: 10 }, { wch: 95 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        XLSX.utils.book_append_sheet(wb, wsNotes, 'Petunjuk');
        XLSX.writeFile(wb, filename);
    };

    const onImportFile = async (file: File) => {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (!raw.length) {
            alert('Sheet kosong.');
            return;
        }

        const col: Record<string, string> = {};
        for (const key of Object.keys(raw[0])) {
            const nk = normH(key);
            for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
                if (col[field] === undefined && aliases.includes(nk)) col[field] = key;
            }
        }
        if (col.akl === undefined) {
            alert('Kolom "No. AKL" tidak ditemukan di sheet.\nGunakan template (tombol Template) sebagai acuan nama kolom.');
            return;
        }

        const str = (rec: Record<string, unknown>, f: string) => (col[f] !== undefined ? String(rec[col[f]] ?? '').trim() : '');
        const val = (rec: Record<string, unknown>, f: string) => (col[f] !== undefined ? rec[col[f]] : '');

        const regs: ImportReg[] = [];
        const byAkl = new Map<string, ImportReg>();
        let skipped = 0;

        for (const rec of raw) {
            const aklRaw = str(rec, 'akl');
            const code = str(rec, 'code');
            const desc = str(rec, 'description');
            const rowEmpty = Object.values(rec).every((c) => String(c ?? '').trim() === '');
            if (rowEmpty) continue;

            const akl = aklRaw || (regs.length ? regs[regs.length - 1].akl_number : '');
            if (!akl) {
                skipped++;
                continue;
            }

            let reg = byAkl.get(akl.toLowerCase());
            if (!reg) {
                // Nama boleh kosong (file "list produk saja") — server yang memutuskan:
                // izin sudah terdaftar → produknya diproses; belum → dilaporkan.
                reg = {
                    akl_number: akl,
                    product_name: str(rec, 'name'),
                    manufacturer: str(rec, 'manufacturer'),
                    license_holder: str(rec, 'holder'),
                    risk_class: str(rec, 'risk'),
                    category: str(rec, 'category'),
                    sub_category: str(rec, 'subcategory'),
                    product_type: str(rec, 'ptype'),
                    application_type: str(rec, 'apptype'),
                    issued_date: parseTanggal(val(rec, 'issued')) ?? '',
                    expired_date: parseTanggal(val(rec, 'expired')) ?? '',
                    items: [],
                };
                byAkl.set(akl.toLowerCase(), reg);
                regs.push(reg);
            } else if (aklRaw) {
                reg.product_name = reg.product_name || str(rec, 'name');
                reg.manufacturer = reg.manufacturer || str(rec, 'manufacturer');
                reg.license_holder = reg.license_holder || str(rec, 'holder');
                reg.risk_class = reg.risk_class || str(rec, 'risk');
                reg.category = reg.category || str(rec, 'category');
                reg.sub_category = reg.sub_category || str(rec, 'subcategory');
                reg.product_type = reg.product_type || str(rec, 'ptype');
                reg.application_type = reg.application_type || str(rec, 'apptype');
                reg.issued_date = reg.issued_date || (parseTanggal(val(rec, 'issued')) ?? '');
                reg.expired_date = reg.expired_date || (parseTanggal(val(rec, 'expired')) ?? '');
            }

            if (code || desc) {
                reg.items.push({ item_code: code, description: desc });
            }
        }

        if (fileRef.current) fileRef.current.value = '';
        if (!regs.length) {
            alert('Tidak ada registrasi valid. Pastikan kolom No. AKL terisi.');
            return;
        }
        if (regs.length > 300) {
            alert(`Terlalu banyak registrasi dalam satu file (${regs.length}). Maksimal 300 — pecah file lalu impor bertahap.`);
            return;
        }

        setPreview({ regs, skipped, itemRows: regs.reduce((s, r) => s + r.items.length, 0) });
    };

    const doImport = () => {
        if (!preview) return;
        setImporting(true);
        router.post(route('regulatory-products.import'), { registrations: preview.regs } as unknown as Record<string, never>, {
            preserveScroll: true,
            onSuccess: () => setPreview(null),
            onError: (errs) => alert('Impor ditolak server:\n' + Object.values(errs).slice(0, 5).join('\n')),
            onFinish: () => setImporting(false),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Registrasi Produk" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">Registrasi Produk</h1>
                        <p className="text-sm text-muted-foreground">
                            Daftar izin edar (AKL). Klik baris untuk membuka detail izin & mengelola produk yang diregistrasikan.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                filter({ q: search });
                            }}
                            className="relative"
                        >
                            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari No. AKL / produk / kode…" className="h-9 w-60 pl-8" />
                        </form>
                        <Select value={status || 'all'} onValueChange={(v) => filter({ status: v === 'all' ? '' : v })}>
                            <SelectTrigger className="h-9 w-[150px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua Status</SelectItem>
                                <SelectItem value="active">Aktif</SelectItem>
                                <SelectItem value="expiring">Segera Habis</SelectItem>
                                <SelectItem value="expired">Kedaluwarsa</SelectItem>
                            </SelectContent>
                        </Select>
                        <Can on="regulatory-products" do="create">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" title="Unduh template Excel">
                                        <Download className="size-4" /> Template
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => downloadTemplate('full')}>Lengkap (izin + produk)</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => downloadTemplate('izin')}>Daftar Izin saja</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => downloadTemplate('produk')}>List Produk saja</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
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
                                <Plus className="size-4" /> Tambah Izin
                            </Button>
                        </Can>
                    </div>
                </div>

                {erpError && (
                    <Card>
                        <CardContent className="py-3 text-sm text-rose-600 dark:text-rose-400">{erpError}</CardContent>
                    </Card>
                )}

                <div className="grid gap-3 sm:grid-cols-4">
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-xs text-muted-foreground">Total Izin Edar</div>
                            <div className="text-2xl font-semibold">{kpi.total}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-xs text-muted-foreground">Produk ERP Tercakup</div>
                            <div className="text-2xl font-semibold">{kpi.items}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-xs text-muted-foreground">Segera Habis (≤ {expiringDays} hari)</div>
                            <div className={cn('text-2xl font-semibold', kpi.expiring > 0 && 'text-amber-600 dark:text-amber-400')}>{kpi.expiring}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-xs text-muted-foreground">Kedaluwarsa</div>
                            <div className={cn('text-2xl font-semibold', kpi.expired > 0 && 'text-rose-600 dark:text-rose-400')}>{kpi.expired}</div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs text-muted-foreground [&>th]:h-9 [&>th]:px-3 [&>th]:font-medium">
                                        <th>No. Izin Edar</th>
                                        <th>Nama Produk</th>
                                        <th>Produsen</th>
                                        <th>License Holder</th>
                                        <th>Kelas Resiko</th>
                                        <th>Terbit</th>
                                        <th>Expired</th>
                                        <th>Status</th>
                                        <th className="!text-right">Produk</th>
                                        <th className="!text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {registrations.data.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} className="py-10 text-center text-muted-foreground">
                                                Belum ada data. Impor dari Excel atau tambah manual.
                                            </td>
                                        </tr>
                                    ) : (
                                        registrations.data.map((r) => {
                                            const st = STATUS_BADGE[regStatus(r, expiringDays)];
                                            return (
                                                <tr
                                                    key={r.id}
                                                    className="cursor-pointer border-b hover:bg-accent/50 [&>td]:px-3 [&>td]:py-2"
                                                    onClick={() => router.visit(route('regulatory-products.show', r.id))}
                                                >
                                                    <td className="font-mono text-xs whitespace-nowrap">{r.akl_number}</td>
                                                    <td className="max-w-64 truncate font-medium">
                                                        <span className="inline-flex items-center gap-1">
                                                            {r.product_name}
                                                            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                                                        </span>
                                                    </td>
                                                    <td className="max-w-52 truncate text-muted-foreground">{r.manufacturer ?? '—'}</td>
                                                    <td className="max-w-44 truncate text-xs">{r.license_holder ?? '—'}</td>
                                                    <td className="max-w-44 truncate text-xs">{r.risk_class ?? '—'}</td>
                                                    <td className="whitespace-nowrap">{tglID(r.issued_date)}</td>
                                                    <td className="whitespace-nowrap">{tglID(r.expired_date)}</td>
                                                    <td>
                                                        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', st.cls)}>{st.label}</span>
                                                    </td>
                                                    <td className="text-right">{r.products_count ?? 0}</td>
                                                    <td className="text-right" onClick={(ev) => ev.stopPropagation()}>
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Can on="regulatory-products" do="edit">
                                                                <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                                                                    <Pencil className="size-4" />
                                                                </Button>
                                                            </Can>
                                                            <Can on="regulatory-products" do="delete">
                                                                <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => del(r)}>
                                                                    <Trash2 className="size-4" />
                                                                </Button>
                                                            </Can>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                <Pagination links={registrations.links} />
            </div>

            {/* Dialog tambah/ubah header izin */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[95vh] w-[97vw] !max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? `Ubah Izin ${editing.akl_number}` : 'Tambah Izin Edar'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <RegHeaderFields data={data} setData={(k, v) => setData(k, v)} errors={errors} />
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Batal
                            </Button>
                            <Button type="submit" disabled={processing}>
                                Simpan
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Preview impor Excel */}
            <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
                <DialogContent className="max-h-[90vh] w-[95vw] !max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Preview Impor Excel</DialogTitle>
                    </DialogHeader>
                    {preview && (
                        <div className="grid gap-3">
                            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                                Terbaca <b>{preview.regs.length} izin edar</b> ({preview.itemRows} kode produk).
                                {preview.skipped > 0 && <span className="text-amber-600 dark:text-amber-400"> {preview.skipped} baris dilewati.</span>}
                                <span className="text-muted-foreground"> Kode produk akan DITULIS sebagai No. AKL di produk ERP yang cocok; kode yang tak ada di ERP dilaporkan.</span>
                            </div>
                            <div className="max-h-[50vh] overflow-auto rounded-md border">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-muted text-muted-foreground">
                                        <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                                            <th>No. AKL</th>
                                            <th>Nama Produk</th>
                                            <th>Produsen</th>
                                            <th>Terbit</th>
                                            <th>Expired</th>
                                            <th className="!text-right">Kode</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.regs.slice(0, 100).map((r, i) => (
                                            <tr key={i} className="border-t [&>td]:px-2 [&>td]:py-1">
                                                <td className="font-mono whitespace-nowrap">{r.akl_number}</td>
                                                <td>{r.product_name}</td>
                                                <td className="max-w-44 truncate">{r.manufacturer || '—'}</td>
                                                <td className="whitespace-nowrap">{r.issued_date || '—'}</td>
                                                <td className="whitespace-nowrap">{r.expired_date || '—'}</td>
                                                <td className="text-right">{r.items.length}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {preview.regs.length > 100 && (
                                    <p className="px-2 py-1.5 text-xs text-muted-foreground">…dan {preview.regs.length - 100} izin lagi.</p>
                                )}
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setPreview(null)}>
                                    Batal
                                </Button>
                                <Button type="button" onClick={doImport} disabled={importing}>
                                    <Upload className="size-4" /> Impor {preview.regs.length} Izin
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
