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
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem, type Paginated } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Pencil, RefreshCw, Search } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Sales', href: '#' },
    { title: 'Database Rumah Sakit', href: '/sales-hospitals' },
];

interface Hospital {
    id: number;
    erp_societe_id: number | null;
    name: string;
    legal_name: string | null;
    erp_type_code: string | null;
    code_client: string | null;
    city: string | null;
    is_active: boolean;
    synced_at: string | null;
}

interface Props {
    q: string;
    type: string;
    status: string;
    hospitals: Paginated<Hospital>;
    summary: { total: number; active: number; byType: Record<string, number> };
    typeLabels: Record<string, string>;
    lastSync: string | null;
}

const TYPE_BADGE: Record<string, string> = {
    MAP_CUSTPH: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    MAP_CUSTGO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    MAP_CUSTGV: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    MAP_CUSTCO: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    MAP_SUBDIST: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
};

export default function SalesHospitals({ q, type, status, hospitals, summary, typeLabels, lastSync }: Props) {
    const [search, setSearch] = useState(q);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Hospital | null>(null);
    const [syncing, setSyncing] = useState(false);

    const { data, setData, put, processing, errors, clearErrors } = useForm<{ name: string; city: string; is_active: boolean }>({
        name: '',
        city: '',
        is_active: true,
    });

    const filter = (params: Record<string, string>) => {
        router.get(route('sales-hospitals.index'), { q, type, status, ...params }, { preserveScroll: true, preserveState: true });
    };

    const doSync = () => {
        if (!confirm('Tarik ulang seluruh rumah sakit dari ERP?')) return;
        setSyncing(true);
        router.post(route('sales-hospitals.sync'), {}, { preserveScroll: true, onFinish: () => setSyncing(false) });
    };

    const openEdit = (h: Hospital) => {
        clearErrors();
        setData({ name: h.name, city: h.city ?? '', is_active: h.is_active });
        setEditing(h);
        setOpen(true);
    };

    const submit: FormEventHandler = (ev) => {
        ev.preventDefault();
        if (!editing) return;
        put(route('sales-hospitals.update', editing.id), { preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    const toggleActive = (h: Hospital, value: boolean) => {
        router.put(route('sales-hospitals.update', h.id),
            h.erp_societe_id === null ? { is_active: value, name: h.name, city: h.city ?? '' } : { is_active: value },
            { preserveScroll: true });
    };

    const typeLabel = (code: string | null) => (code ? (typeLabels[code] ?? code) : 'Manual');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Database Rumah Sakit" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">Database Rumah Sakit</h1>
                        <p className="text-sm text-muted-foreground">
                            Master rumah sakit dari ERP (third party bertipe RS Swasta / Pemerintah / Corporate / Sub Distributor).
                            {lastSync && <> Sync terakhir: {new Date(lastSync).toLocaleString('id-ID')}.</>}
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
                            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama / PT / kode / kota…" className="h-9 w-56 pl-8" />
                        </form>
                        <Select value={type || 'all'} onValueChange={(v) => filter({ type: v === 'all' ? '' : v })}>
                            <SelectTrigger className="h-9 w-[170px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua Tipe</SelectItem>
                                <SelectItem value="MAP_CUSTPH">RS Swasta</SelectItem>
                                <SelectItem value="MAP_CUSTGO">Pemerintah</SelectItem>
                                <SelectItem value="MAP_CUSTCO">Corporate</SelectItem>
                                <SelectItem value="MAP_SUBDIST">Sub Distributor</SelectItem>
                                <SelectItem value="manual">Manual (non-ERP)</SelectItem>
                            </SelectContent>
                        </Select>
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
                        <Can on="sales-hospitals" do="edit">
                            <Button onClick={doSync} disabled={syncing}>
                                <RefreshCw className={cn('size-4', syncing && 'animate-spin')} /> Sync dari ERP
                            </Button>
                        </Can>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <Card>
                        <CardContent className="py-4">
                            <div className="text-xs text-muted-foreground">Total Rumah Sakit</div>
                            <div className="text-2xl font-semibold">{summary.total}</div>
                            <div className="text-[11px] text-muted-foreground">{summary.active} aktif</div>
                        </CardContent>
                    </Card>
                    <Card className="sm:col-span-2">
                        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 py-4 text-xs">
                            {Object.entries(summary.byType).map(([code, n]) => (
                                <div key={code} className="flex items-center gap-1.5">
                                    <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', TYPE_BADGE[code] ?? 'bg-muted text-muted-foreground')}>
                                        {typeLabel(code === 'manual' ? null : code)}
                                    </span>
                                    <b>{n}</b>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table className="min-w-full text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nama Rumah Sakit</TableHead>
                                        <TableHead>Badan Hukum</TableHead>
                                        <TableHead>Tipe</TableHead>
                                        <TableHead>Kode</TableHead>
                                        <TableHead>Kota</TableHead>
                                        <TableHead className="text-center">Aktif</TableHead>
                                        <TableHead className="text-right">Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {hospitals.data.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                                                Belum ada data. Klik <b>Sync dari ERP</b> untuk menarik rumah sakit dari ERP.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        hospitals.data.map((h) => (
                                            <TableRow key={h.id} className={h.is_active ? '' : 'opacity-50'}>
                                                <TableCell className="font-medium">{h.name}</TableCell>
                                                <TableCell className="max-w-72 truncate text-muted-foreground">{h.legal_name && h.legal_name !== h.name ? h.legal_name : '—'}</TableCell>
                                                <TableCell>
                                                    <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', h.erp_type_code ? (TYPE_BADGE[h.erp_type_code] ?? 'bg-muted') : 'bg-muted text-muted-foreground')}>
                                                        {typeLabel(h.erp_type_code)}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">{h.code_client ?? '—'}</TableCell>
                                                <TableCell>{h.city ?? '—'}</TableCell>
                                                <TableCell className="text-center">
                                                    <Can on="sales-hospitals" do="edit" fallback={<span className="text-xs">{h.is_active ? 'Ya' : 'Tidak'}</span>}>
                                                        <Switch checked={h.is_active} onCheckedChange={(v) => toggleActive(h, v)} />
                                                    </Can>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {h.erp_societe_id === null ? (
                                                        <Can on="sales-hospitals" do="edit">
                                                            <Button variant="ghost" size="icon" onClick={() => openEdit(h)}>
                                                                <Pencil className="size-4" />
                                                            </Button>
                                                        </Can>
                                                    ) : (
                                                        <span className="text-[11px] text-muted-foreground">ERP #{h.erp_societe_id}</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Pagination links={hospitals.links} />

                <Card className="border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/30">
                    <CardContent className="py-3 text-sm text-sky-900 dark:text-sky-200">
                        <b>Penambahan rumah sakit baru dilakukan di ERP.</b> Silakan hubungi <b>Admin Sales</b> untuk menambahkan rumah sakit
                        (third party bertipe RS Swasta / Pemerintah / Corporate / Sub Distributor) pada ERP, lalu klik <b>Sync dari ERP</b> di halaman ini.
                    </CardContent>
                </Card>

                <p className="text-xs text-muted-foreground">
                    Nama tampil memakai alias di ERP (nama RS yang dikenal); badan hukum (PT/Yayasan) disimpan terpisah.
                    Baris ERP tidak bisa diubah dari sini — perbaiki datanya di ERP lalu sync ulang. RS yang hilang dari ERP otomatis dinonaktifkan, tidak dihapus.
                </p>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="w-[95vw] max-w-md">
                    <DialogHeader>
                        <DialogTitle>Ubah RS Manual</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="h_name">Nama Rumah Sakit *</Label>
                            <Input id="h_name" value={data.name} onChange={(e) => setData('name', e.target.value)} required />
                            <InputError message={errors.name} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="h_city">Kota</Label>
                            <Input id="h_city" value={data.city} onChange={(e) => setData('city', e.target.value)} />
                            <InputError message={errors.city} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            RS manual akan otomatis tertaut ke ERP saat nama yang sama muncul di sync berikutnya.
                        </p>
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
        </AppLayout>
    );
}
