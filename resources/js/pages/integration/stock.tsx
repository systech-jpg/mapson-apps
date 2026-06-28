import { Can } from '@/components/can';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type Paginated } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Boxes, LoaderCircle, Search } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integrasi Data', href: '#' },
    { title: 'ERP', href: '#' },
    { title: 'Stok', href: '/integration/stock' },
];

interface StockRow {
    id: number;
    ref: string | null;
    label: string | null;
    principal: string | null;
    category_l2: string | null;
    buffer: string | number;
    qty: string | number;
}

interface Props {
    erpStock: Paginated<StockRow>;
    stockMeta: { count: number; lastSync: string | null; snapshotDate: string | null; today: string };
    filters: { search: string };
}

const money = (v: string | number | null) => Number(v ?? 0).toLocaleString('id-ID');
const txt = (v: string | number | null) => (v === null || v === '' ? '-' : String(v));

export default function ErpStock({ erpStock, stockMeta, filters }: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const sync = useForm({ as_of: stockMeta.snapshotDate ?? stockMeta.today });

    const pull = () => sync.post(route('integration.sync-stock'), { preserveScroll: true });
    const submitSearch: FormEventHandler = (e) => {
        e.preventDefault();
        router.get(route('integration.stock'), { search }, { preserveState: true, preserveScroll: true, replace: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="ERP — Stok" />

            <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                    <h1 className="text-lg font-semibold">Data Stok (ERP)</h1>
                    <p className="text-xs text-muted-foreground">
                        Saldo akhir hasil hitung mutasi (KIT + usage report) — tanggal "as of" benar-benar historis.
                        {stockMeta.snapshotDate ? ` Snapshot per ${stockMeta.snapshotDate}.` : ' Belum pernah ditarik.'} {stockMeta.count.toLocaleString('id-ID')} item.
                    </p>
                </div>

                <Card>
                    <CardContent className="flex flex-wrap items-end gap-3 py-4">
                        <Can on="erp-stock" do="edit">
                            <div className="grid gap-1">
                                <label className="text-[11px] text-muted-foreground">Stok per tanggal (as of)</label>
                                <Input type="date" className="h-8 w-40 text-xs" value={sync.data.as_of} onChange={(e) => sync.setData('as_of', e.target.value)} />
                            </div>
                            <Button size="sm" className="h-8" onClick={pull} disabled={sync.processing}>
                                {sync.processing ? <LoaderCircle className="size-4 animate-spin" /> : <Boxes className="size-4" />}
                                Tarik Stok ERP
                            </Button>
                        </Can>
                        <form onSubmit={submitSearch} className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input className="h-8 w-60 pl-8 text-xs" placeholder="Cari kode / nama / principal..." value={search} onChange={(e) => setSearch(e.target.value)} />
                            </div>
                            <Button type="submit" variant="outline" size="sm" className="h-8">Cari</Button>
                        </form>
                        {stockMeta.lastSync && <span className="ml-auto text-xs text-muted-foreground">Sinkron terakhir: {stockMeta.lastSync}</span>}
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table className="text-xs [&_td]:px-3 [&_td]:py-1 [&_th]:h-8 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="whitespace-nowrap">Kode</TableHead>
                                        <TableHead>Nama Barang</TableHead>
                                        <TableHead>Principal</TableHead>
                                        <TableHead>Kategori</TableHead>
                                        <TableHead className="text-right">Buffer</TableHead>
                                        <TableHead className="text-right">Stok</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {erpStock.data.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                                                {filters.search ? 'Tidak ada hasil.' : 'Belum ada data stok. Pilih tanggal lalu klik "Tarik Stok ERP".'}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        erpStock.data.map((r) => (
                                            <TableRow key={r.id}>
                                                <TableCell className="font-medium whitespace-nowrap">{txt(r.ref)}</TableCell>
                                                <TableCell className="max-w-[260px] truncate" title={String(r.label ?? '')}>{txt(r.label)}</TableCell>
                                                <TableCell className="max-w-[140px] truncate" title={String(r.principal ?? '')}>{txt(r.principal)}</TableCell>
                                                <TableCell className="max-w-[140px] truncate" title={String(r.category_l2 ?? '')}>{txt(r.category_l2)}</TableCell>
                                                <TableCell className="text-right">{money(r.buffer)}</TableCell>
                                                <TableCell className={`text-right font-medium ${Number(r.qty) < Number(r.buffer) ? 'text-red-600' : ''}`}>{money(r.qty)}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <div className="mt-3"><Pagination links={erpStock.links} /></div>
            </div>
        </AppLayout>
    );
}
