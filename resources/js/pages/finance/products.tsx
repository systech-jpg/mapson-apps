import { ConfirmDelete } from '@/components/confirm-delete';
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
import { rupiah } from '@/lib/pricing';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Plus } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Finance', href: '#' },
    { title: 'Data Produk', href: '/finance/products' },
];

interface Product { id: string; sku_code: string; product_name: string; principal_name: string | null; currency_code: string | null; final_price: string | number }
interface Currency { code: string; name: string | null }

interface Props {
    products: { data: Product[]; links: { url: string | null; label: string; active: boolean }[]; total: number };
    filters: { search: string };
    currencies: Currency[];
}

const NONE = 'none';

export default function FinanceProducts({ products, filters, currencies }: Props) {
    const [search, setSearch] = useState(filters.search);
    const [open, setOpen] = useState(false);
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({
        sku_code: '', product_name: '', principal_name: '', currency_code: '',
    });

    const openCreate = () => { reset(); clearErrors(); setOpen(true); };
    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('finance.products.store'), { preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Data Produk" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">Data Produk</h1>
                        <p className="text-sm text-muted-foreground">Master produk untuk Pricing Engine ({products.total}). Akan ditarik dari katalog ERP nanti.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <form
                            onSubmit={(e) => { e.preventDefault(); router.get(route('finance.products.index'), { search }, { preserveState: true, replace: true }); }}
                            className="flex gap-2"
                        >
                            <Input className="w-56" placeholder="Cari SKU / nama / principal…" value={search} onChange={(e) => setSearch(e.target.value)} />
                            <Button type="submit" variant="outline">Cari</Button>
                        </form>
                        <Button onClick={openCreate}><Plus className="size-4" /> Tambah Produk</Button>
                    </div>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>SKU</TableHead>
                                    <TableHead>Nama Produk</TableHead>
                                    <TableHead>Principal</TableHead>
                                    <TableHead>Valuta</TableHead>
                                    <TableHead className="text-right">Harga Master</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {products.data.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Belum ada produk.</TableCell></TableRow>
                                ) : products.data.map((p) => (
                                    <TableRow key={p.id}>
                                        <TableCell className="font-mono text-xs">{p.sku_code}</TableCell>
                                        <TableCell className="font-medium">{p.product_name}</TableCell>
                                        <TableCell>{p.principal_name ?? '-'}</TableCell>
                                        <TableCell>{p.currency_code ?? '-'}</TableCell>
                                        <TableCell className="text-right font-mono">{Number(p.final_price) > 0 ? rupiah(Number(p.final_price)) : '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <ConfirmDelete url={route('finance.products.destroy', p.id)} title={`Hapus ${p.product_name}?`} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Pagination links={products.links} />
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Tambah Produk</DialogTitle></DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2"><Label htmlFor="sku">SKU *</Label><Input id="sku" value={data.sku_code} onChange={(e) => setData('sku_code', e.target.value)} required /><InputError message={errors.sku_code} /></div>
                            <div className="grid gap-2">
                                <Label>Valuta</Label>
                                <Select value={data.currency_code || NONE} onValueChange={(v) => setData('currency_code', v === NONE ? '' : v)}>
                                    <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>- Tidak diisi -</SelectItem>
                                        {currencies.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-2"><Label htmlFor="pn">Nama Produk *</Label><Input id="pn" value={data.product_name} onChange={(e) => setData('product_name', e.target.value)} required /><InputError message={errors.product_name} /></div>
                        <div className="grid gap-2"><Label htmlFor="pr">Principal</Label><Input id="pr" value={data.principal_name} onChange={(e) => setData('principal_name', e.target.value)} /></div>
                        <DialogFooter><Button type="submit" disabled={processing}>Simpan</Button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
