import { Can } from '@/components/can';
import InputError from '@/components/input-error';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type Paginated } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Pencil, Plus, Search, Wand2 } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Sales', href: '#' },
    { title: 'Database Dokter', href: '/sales-doctors' },
];

interface Doctor {
    rowid: number;
    fullname: string;
    gender: string | null;
    specialty: string | null;
    str_number: string | null;
    sip_number: string | null;
    email: string | null;
    phone_mobile: string | null;
    join_date: string | null;
    consultation_fee: number | null;
    bank_name: string | null;
    bank_account_number: string | null;
    note_public: string | null;
    status: number;
}

interface Props {
    q: string;
    status: string;
    doctors: Paginated<Doctor> | null;
    summary: { total: number; active: number };
    specialties: string[];
    error: string | null;
}

// Spesialisasi → gelar belakang. Sumber penyusun nama otomatis.
const SPECIALTIES: { key: string; label: string; suffix: string }[] = [
    { key: 'ot', label: 'Orthopaedi & Traumatologi', suffix: 'Sp.OT' },
    { key: 'bs', label: 'Bedah Saraf', suffix: 'Sp.BS' },
    { key: 's', label: 'Neurologi (Saraf)', suffix: 'Sp.S' },
    { key: 'b', label: 'Bedah Umum', suffix: 'Sp.B' },
    { key: 'u', label: 'Urologi', suffix: 'Sp.U' },
    { key: 'pd', label: 'Penyakit Dalam', suffix: 'Sp.PD' },
    { key: 'an', label: 'Anestesiologi', suffix: 'Sp.An' },
    { key: 'rad', label: 'Radiologi', suffix: 'Sp.Rad' },
    { key: 'kfr', label: 'Kedokteran Fisik & Rehabilitasi', suffix: 'Sp.KFR' },
    { key: 'jp', label: 'Jantung & Pembuluh Darah', suffix: 'Sp.JP' },
    { key: 'btkv', label: 'Bedah Toraks Kardiovaskular', suffix: 'Sp.BTKV' },
    { key: 'umum', label: 'Dokter Umum', suffix: '' },
    { key: 'lainnya', label: 'Lainnya (isi manual)', suffix: '' },
];

const PREFIXES = ['dr.', 'Dr. dr.', 'Prof. dr.', 'Prof. Dr. dr.'];

const titleCase = (s: string) => s.replace(/\S+/g, (w) => (w[0] ?? '').toUpperCase() + w.slice(1));

const rupiah = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

interface Composer {
    baseName: string;
    prefix: string;
    specKey: string;
    consultant: boolean;
    subSpec: string;
}

const composeName = (c: Composer): string => {
    const spec = SPECIALTIES.find((s) => s.key === c.specKey);
    let suffix = spec?.suffix ?? '';
    if (suffix && c.consultant) suffix += ' (K)';
    if (suffix && c.subSpec.trim()) suffix += ' ' + c.subSpec.trim();
    const nama = titleCase(c.baseName.trim());
    return nama ? `${c.prefix} ${nama}${suffix ? ', ' + suffix : ''}` : '';
};

const composeSpecialty = (c: Composer): string => {
    const spec = SPECIALTIES.find((s) => s.key === c.specKey);
    if (!spec || spec.key === 'lainnya') return '';
    if (spec.key === 'umum') return 'Dokter Umum';
    return `Spesialis ${spec.label}${c.subSpec.trim() ? ` (${c.subSpec.trim()})` : ''}`;
};

export default function SalesDoctors({ q, status, doctors, summary, specialties, error }: Props) {
    const [search, setSearch] = useState(q);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Doctor | null>(null);
    // Penyusun nama otomatis: aktif selama user belum menyentuh field nama final secara manual.
    const [composer, setComposer] = useState<Composer>({ baseName: '', prefix: 'dr.', specKey: 'ot', consultant: false, subSpec: '' });
    const [manualName, setManualName] = useState(false);

    const { data, setData, post, put, processing, errors, clearErrors } = useForm<{
        fullname: string;
        gender: string;
        specialty: string;
        str_number: string;
        sip_number: string;
        email: string;
        phone_mobile: string;
        join_date: string;
        consultation_fee: string;
        bank_name: string;
        bank_account_number: string;
        note_public: string;
        is_active: boolean;
    }>({
        fullname: '', gender: '', specialty: '', str_number: '', sip_number: '', email: '', phone_mobile: '',
        join_date: '', consultation_fee: '', bank_name: '', bank_account_number: '', note_public: '', is_active: true,
    });

    const filter = (params: Record<string, string>) => {
        router.get(route('sales-doctors.index'), { q, status, ...params }, { preserveScroll: true, preserveState: true });
    };

    // Perubahan komponen penyusun → susun ulang nama & spesialisasi (kecuali mode manual).
    const patchComposer = (patch: Partial<Composer>) => {
        const next = { ...composer, ...patch };
        setComposer(next);
        if (!manualName) {
            setData((d) => ({
                ...d,
                fullname: composeName(next),
                specialty: next.specKey === 'lainnya' ? d.specialty : composeSpecialty(next),
            }));
        }
    };

    const openAdd = () => {
        clearErrors();
        setComposer({ baseName: '', prefix: 'dr.', specKey: 'ot', consultant: false, subSpec: '' });
        setManualName(false);
        setData({
            fullname: '', gender: '', specialty: composeSpecialty({ baseName: '', prefix: 'dr.', specKey: 'ot', consultant: false, subSpec: '' }),
            str_number: '', sip_number: '', email: '', phone_mobile: '',
            join_date: '', consultation_fee: '', bank_name: '', bank_account_number: '', note_public: '', is_active: true,
        });
        setEditing(null);
        setOpen(true);
    };

    const openEdit = (d: Doctor) => {
        clearErrors();
        // Nama existing tidak bisa diurai balik dengan andal → mode manual; komponen penyusun
        // tetap bisa dipakai (begitu disentuh, nama disusun ulang dari komponen).
        setComposer({ baseName: '', prefix: 'dr.', specKey: 'lainnya', consultant: false, subSpec: '' });
        setManualName(true);
        setData({
            fullname: d.fullname,
            gender: d.gender ?? '',
            specialty: d.specialty ?? '',
            str_number: d.str_number ?? '',
            sip_number: d.sip_number ?? '',
            email: d.email ?? '',
            phone_mobile: d.phone_mobile ?? '',
            join_date: d.join_date ? d.join_date.substring(0, 10) : '',
            consultation_fee: d.consultation_fee !== null && d.consultation_fee > 0 ? String(Math.round(d.consultation_fee)) : '',
            bank_name: d.bank_name ?? '',
            bank_account_number: d.bank_account_number ?? '',
            note_public: d.note_public ?? '',
            is_active: d.status === 1,
        });
        setEditing(d);
        setOpen(true);
    };

    const submit: FormEventHandler = (ev) => {
        ev.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) {
            put(route('sales-doctors.update', editing.rowid), opts);
        } else {
            post(route('sales-doctors.store'), opts);
        }
    };

    // Kirim SEMUA field saat toggle — endpoint update menimpa seluruh kolom yang divalidasi.
    const toggleActive = (d: Doctor, value: boolean) => {
        router.put(route('sales-doctors.update', d.rowid), {
            fullname: d.fullname,
            gender: d.gender ?? '',
            specialty: d.specialty ?? '',
            str_number: d.str_number ?? '',
            sip_number: d.sip_number ?? '',
            email: d.email ?? '',
            phone_mobile: d.phone_mobile ?? '',
            join_date: d.join_date ? d.join_date.substring(0, 10) : '',
            consultation_fee: d.consultation_fee !== null && d.consultation_fee > 0 ? String(d.consultation_fee) : '',
            bank_name: d.bank_name ?? '',
            bank_account_number: d.bank_account_number ?? '',
            note_public: d.note_public ?? '',
            is_active: value,
        }, { preserveScroll: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Database Dokter" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">Database Dokter</h1>
                        <p className="text-sm text-muted-foreground">
                            Master dokter — tersimpan langsung di database ERP; tambah/ubah dari sini langsung tercatat di ERP.
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
                            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama / spesialisasi / STR / SIP…" className="h-9 w-64 pl-8" />
                        </form>
                        <Select value={status || 'all'} onValueChange={(v) => filter({ status: v === 'all' ? '' : v })}>
                            <SelectTrigger className="h-9 w-[130px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua Status</SelectItem>
                                <SelectItem value="active">Aktif</SelectItem>
                                <SelectItem value="inactive">Nonaktif</SelectItem>
                            </SelectContent>
                        </Select>
                        <Can on="sales-doctors" do="create">
                            <Button onClick={openAdd} disabled={!!error}>
                                <Plus className="size-4" /> Tambah Dokter
                            </Button>
                        </Can>
                    </div>
                </div>

                {error && (
                    <Card>
                        <CardContent className="py-3 text-sm text-rose-600 dark:text-rose-400">{error}</CardContent>
                    </Card>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-xs text-muted-foreground">Total Dokter</div>
                            <div className="text-2xl font-semibold">{summary.total}</div>
                            <div className="text-[11px] text-muted-foreground">{summary.active} aktif</div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table className="min-w-full text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nama Dokter</TableHead>
                                        <TableHead>Spesialisasi</TableHead>
                                        <TableHead>No. STR</TableHead>
                                        <TableHead>No. SIP</TableHead>
                                        <TableHead>Kontak</TableHead>
                                        <TableHead className="text-right">Tarif Konsul</TableHead>
                                        <TableHead className="text-center">Aktif</TableHead>
                                        <TableHead className="text-right">Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {!doctors || doctors.data.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                                                Tidak ada data dokter.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        doctors.data.map((d) => (
                                            <TableRow key={d.rowid} className={d.status === 1 ? '' : 'opacity-50'}>
                                                <TableCell className="font-medium">{d.fullname}</TableCell>
                                                <TableCell className="max-w-64 truncate">{d.specialty ?? '—'}</TableCell>
                                                <TableCell className="font-mono text-xs">{d.str_number ?? '—'}</TableCell>
                                                <TableCell className="font-mono text-xs">{d.sip_number ?? '—'}</TableCell>
                                                <TableCell className="text-xs">
                                                    {d.phone_mobile || d.email ? (
                                                        <>
                                                            {d.phone_mobile && <div>{d.phone_mobile}</div>}
                                                            {d.email && <div className="text-muted-foreground">{d.email}</div>}
                                                        </>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right text-xs whitespace-nowrap">
                                                    {d.consultation_fee && d.consultation_fee > 0 ? rupiah(d.consultation_fee) : '—'}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Can on="sales-doctors" do="edit" fallback={<span className="text-xs">{d.status === 1 ? 'Ya' : 'Tidak'}</span>}>
                                                        <Switch checked={d.status === 1} onCheckedChange={(v) => toggleActive(d, v)} />
                                                    </Can>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Can on="sales-doctors" do="edit">
                                                        <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                                                            <Pencil className="size-4" />
                                                        </Button>
                                                    </Can>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {doctors && <Pagination links={doctors.links} />}

                <p className="text-xs text-muted-foreground">
                    Dokter nonaktif tidak muncul di pilihan input Sales Daily. Data tidak pernah dihapus — nonaktifkan saja bila sudah tidak dipakai.
                </p>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[92vh] w-[95vw] !max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Ubah Data Dokter' : 'Tambah Dokter'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        {/* Penyusun nama otomatis */}
                        <div className="rounded-md border bg-muted/30 p-3">
                            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                                <Wand2 className="size-4" /> Penyusun Nama Otomatis
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="c_name" className="text-xs">Nama (tanpa gelar)</Label>
                                    <Input id="c_name" className="h-8" value={composer.baseName} onChange={(e) => patchComposer({ baseName: e.target.value })} placeholder="mis. ridhu" />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label className="text-xs">Gelar Depan</Label>
                                    <Select value={composer.prefix} onValueChange={(v) => patchComposer({ prefix: v })}>
                                        <SelectTrigger className="h-8">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PREFIXES.map((p) => (
                                                <SelectItem key={p} value={p}>
                                                    {p}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-1.5">
                                    <Label className="text-xs">Spesialisasi</Label>
                                    <Select value={composer.specKey} onValueChange={(v) => patchComposer({ specKey: v })}>
                                        <SelectTrigger className="h-8">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {SPECIALTIES.map((s) => (
                                                <SelectItem key={s.key} value={s.key}>
                                                    {s.label}
                                                    {s.suffix ? ` — ${s.suffix}` : ''}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex items-end gap-2 pb-1">
                                        <Switch id="c_k" checked={composer.consultant} onCheckedChange={(v) => patchComposer({ consultant: v })} />
                                        <Label htmlFor="c_k" className="text-xs">Konsultan (K)</Label>
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="c_sub" className="text-xs">Sub-spesialis</Label>
                                        <Input id="c_sub" className="h-8" value={composer.subSpec} onChange={(e) => patchComposer({ subSpec: e.target.value })} placeholder="mis. Spine" />
                                    </div>
                                </div>
                            </div>
                            {manualName && (
                                <button
                                    type="button"
                                    className="mt-2 text-xs text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
                                    onClick={() => {
                                        setManualName(false);
                                        setData((d) => ({ ...d, fullname: composeName(composer), specialty: composer.specKey === 'lainnya' ? d.specialty : composeSpecialty(composer) }));
                                    }}
                                >
                                    Susun ulang otomatis dari komponen di atas
                                </button>
                            )}
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="d_name">Nama Lengkap + Gelar (hasil akhir) *</Label>
                            <Input
                                id="d_name"
                                value={data.fullname}
                                onChange={(e) => {
                                    setManualName(true);
                                    setData('fullname', e.target.value);
                                }}
                                placeholder="mis. dr. Ridhu, Sp.OT"
                                required
                            />
                            <InputError message={errors.fullname} />
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="d_spec">Spesialisasi (teks tersimpan)</Label>
                                <Input id="d_spec" list="d-specialties" value={data.specialty} onChange={(e) => setData('specialty', e.target.value)} placeholder="mis. Spesialis Orthopaedi & Traumatologi (Spine)" />
                                <InputError message={errors.specialty} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Jenis Kelamin</Label>
                                <Select value={data.gender || 'unset'} onValueChange={(v) => setData('gender', v === 'unset' ? '' : v)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unset">— tidak diisi —</SelectItem>
                                        <SelectItem value="male">Laki-laki</SelectItem>
                                        <SelectItem value="female">Perempuan</SelectItem>
                                    </SelectContent>
                                </Select>
                                <InputError message={errors.gender} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="d_str">No. STR</Label>
                                <Input id="d_str" value={data.str_number} onChange={(e) => setData('str_number', e.target.value)} />
                                <InputError message={errors.str_number} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="d_sip">No. SIP</Label>
                                <Input id="d_sip" value={data.sip_number} onChange={(e) => setData('sip_number', e.target.value)} />
                                <InputError message={errors.sip_number} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="d_phone">No. HP</Label>
                                <Input id="d_phone" value={data.phone_mobile} onChange={(e) => setData('phone_mobile', e.target.value)} />
                                <InputError message={errors.phone_mobile} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="d_email">Email</Label>
                                <Input id="d_email" type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} />
                                <InputError message={errors.email} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="d_join">Tanggal Bergabung</Label>
                                <Input id="d_join" type="date" value={data.join_date} onChange={(e) => setData('join_date', e.target.value)} />
                                <InputError message={errors.join_date} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="d_fee">Tarif Konsultasi (Rp)</Label>
                                <Input id="d_fee" type="number" min={0} step="any" value={data.consultation_fee} onChange={(e) => setData('consultation_fee', e.target.value)} />
                                <InputError message={errors.consultation_fee} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="d_bank">Nama Bank</Label>
                                <Input id="d_bank" value={data.bank_name} onChange={(e) => setData('bank_name', e.target.value)} />
                                <InputError message={errors.bank_name} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="d_rek">No. Rekening</Label>
                                <Input id="d_rek" value={data.bank_account_number} onChange={(e) => setData('bank_account_number', e.target.value)} />
                                <InputError message={errors.bank_account_number} />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="d_note">Catatan</Label>
                            <Textarea id="d_note" rows={2} value={data.note_public} onChange={(e) => setData('note_public', e.target.value)} />
                            <InputError message={errors.note_public} />
                        </div>

                        {editing && (
                            <div className="flex items-center gap-2">
                                <Switch id="d_active" checked={data.is_active} onCheckedChange={(v) => setData('is_active', v)} />
                                <Label htmlFor="d_active">Aktif</Label>
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">Data tersimpan langsung ke database ERP.</p>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Batal
                            </Button>
                            <Button type="submit" disabled={processing}>
                                Simpan
                            </Button>
                        </DialogFooter>
                    </form>

                    <datalist id="d-specialties">
                        {specialties.map((s) => (
                            <option key={s} value={s} />
                        ))}
                    </datalist>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
