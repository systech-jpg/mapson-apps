import { Can } from '@/components/can';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type Paginated } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Boxes, ExternalLink, LoaderCircle, RefreshCw, Search, ShoppingCart, X } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Integrasi Data', href: '/integration' }];

type SalesRow = Record<string, string | number | null> & { id: number };

interface Props {
    stock: unknown[];
    sales: Paginated<SalesRow>;
    salesTotal: number;
    filters: { search: string };
    lastSyncedAt: string | null;
    erpBaseUrl: string | null;
}

const money = (v: string | number | null) => Number(v ?? 0).toLocaleString('id-ID');
const txt = (v: string | number | null) => (v === null || v === '' ? '-' : String(v));

export default function IntegrationIndex({ stock, sales, salesTotal, filters, lastSyncedAt, erpBaseUrl }: Props) {
    const { post, processing } = useForm();
    const [search, setSearch] = useState(filters.search ?? '');
    const [detail, setDetail] = useState<SalesRow | null>(null);

    const syncSales = () => post(route('integration.sync-sales'), { preserveScroll: true });

    const submitSearch: FormEventHandler = (e) => {
        e.preventDefault();
        router.get(route('integration.index'), { search }, { preserveState: true, preserveScroll: true, replace: true });
    };

    const clearSearch = () => {
        setSearch('');
        router.get(route('integration.index'), {}, { preserveState: true, preserveScroll: true, replace: true });
    };

    const erpLink = (id: string | number | null) => (erpBaseUrl && id ? `${erpBaseUrl}/compta/facture/card.php?facid=${id}` : null);

    // Field groups shown in the detail modal.
    const detailGroups: { title: string; fields: [string, string][] }[] = [
        {
            title: 'Invoice',
            fields: [
                ['Invoice No', 'invoice_no'], ['Invoice Date', 'invoice_date'], ['Tahun', 'tahun'],
                ['Nomor Faktur', 'nomor_faktur'], ['Reff (SO)', 'reff'], ['Remarks', 'remarks'],
            ],
        },
        {
            title: 'Customer',
            fields: [['Bill to', 'bill_to'], ['Customer', 'customer'], ['Region', 'region'], ['Patient', 'patient']],
        },
        {
            title: 'Pembelian & Pengiriman',
            fields: [
                ['Purchase Date', 'purchase_date'], ['Purchase Number', 'purchase_number'],
                ['DO Date', 'do_date'], ['DO No', 'do_no'], ['Usage Report', 'usage_report'],
            ],
        },
        {
            title: 'Produk',
            fields: [
                ['Part Number', 'part_number'], ['Description', 'description'], ['Quantity', 'quantity'], ['Merk', 'merk'],
                ['Category 1', 'category_1'], ['Category 2', 'category_2'], ['Category 3', 'category_3'], ['Category 4', 'category_4'],
            ],
        },
        {
            title: 'Sales & Tim',
            fields: [['Sales', 'sales'], ['Doctor', 'doctor'], ['Technical Support', 'technical_support']],
        },
        {
            title: 'Pembayaran',
            fields: [
                ['Status', 'paid_unpaid'], ['Tempo', 'tempo'], ['Due Date', 'due_date'], ['Payment Date', 'payment_date'],
            ],
        },
    ];

    const amountFields: [string, string][] = [
        ['Price Qty', 'price_qty'], ['Total Price', 'total_price'], ['Disc (%)', 'disc'], ['Disc Value', 'disc_value'],
        ['DPP', 'dpp'], ['PPN', 'ppn'], ['Down Payment', 'down_payment'], ['TOTAL', 'total'],
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Integrasi Data" />

            <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-semibold">Integrasi Data</h1>
                        <p className="text-xs text-muted-foreground">
                            Data dari ERP.{' '}
                            {lastSyncedAt ? <span>Sinkron terakhir: {lastSyncedAt}</span> : <span>Belum pernah disinkronkan.</span>}
                        </p>
                    </div>
                    <Can on="data-integration" do="edit">
                        <Button size="sm" onClick={syncSales} disabled={processing}>
                            {processing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                            Sinkronkan dari ERP
                        </Button>
                    </Can>
                </div>

                <Tabs defaultValue="sales">
                    <TabsList className="h-8">
                        <TabsTrigger value="sales" className="gap-1.5 text-xs">
                            <ShoppingCart className="size-3.5" /> Data Sales
                        </TabsTrigger>
                        <TabsTrigger value="stock" className="gap-1.5 text-xs">
                            <Boxes className="size-3.5" /> Data Stok
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="sales">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <form onSubmit={submitSearch} className="flex items-center gap-2">
                                <div className="relative">
                                    <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        className="h-8 w-72 pl-8 text-xs"
                                        placeholder="Cari invoice, customer, part, sales..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />
                                </div>
                                <Button type="submit" variant="outline" size="sm" className="h-8">
                                    Cari
                                </Button>
                                {filters.search && (
                                    <Button type="button" variant="ghost" size="sm" className="h-8" onClick={clearSearch}>
                                        <X className="size-3.5" /> Reset
                                    </Button>
                                )}
                            </form>
                            <span className="text-xs text-muted-foreground">
                                {filters.search
                                    ? `${sales.total.toLocaleString('id-ID')} hasil`
                                    : `Total ${salesTotal.toLocaleString('id-ID')} baris`}
                                {sales.total > 0 && ` · ${sales.from}–${sales.to}`} · klik baris untuk detail
                            </span>
                        </div>

                        <Card>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <Table className="text-xs [&_td]:px-3 [&_td]:py-1 [&_th]:h-8 [&_th]:px-3">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="whitespace-nowrap">Invoice</TableHead>
                                                <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                                                <TableHead>Customer</TableHead>
                                                <TableHead className="whitespace-nowrap">Part</TableHead>
                                                <TableHead>Deskripsi</TableHead>
                                                <TableHead className="text-right">Qty</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                                                <TableHead className="whitespace-nowrap">Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {sales.data.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                                                        {filters.search ? 'Tidak ada hasil untuk pencarian ini.' : 'Belum ada data. Klik "Sinkronkan dari ERP".'}
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                sales.data.map((row) => (
                                                    <TableRow key={row.id} className="cursor-pointer" onClick={() => setDetail(row)}>
                                                        <TableCell className="font-medium whitespace-nowrap">{txt(row.invoice_no)}</TableCell>
                                                        <TableCell className="whitespace-nowrap">{txt(row.invoice_date)}</TableCell>
                                                        <TableCell className="max-w-[160px] truncate" title={String(row.customer ?? '')}>
                                                            {txt(row.customer)}
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">{txt(row.part_number)}</TableCell>
                                                        <TableCell className="max-w-[220px] truncate" title={String(row.description ?? '')}>
                                                            {txt(row.description)}
                                                        </TableCell>
                                                        <TableCell className="text-right">{Number(row.quantity ?? 0)}</TableCell>
                                                        <TableCell className="text-right whitespace-nowrap">{money(row.total)}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={row.paid_unpaid === 'PAID' ? 'default' : 'secondary'} className="px-1.5 py-0 text-[10px]">
                                                                {txt(row.paid_unpaid)}
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="mt-3">
                            <Pagination links={sales.links} />
                        </div>
                    </TabsContent>

                    <TabsContent value="stock">
                        <Card>
                            <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                                Data stok akan ditambahkan berikutnya (ditarik dari ERP).
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Detail modal */}
            <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {txt(detail?.invoice_no ?? null)}
                            {detail && erpLink(detail.erp_invoice_id) && (
                                <a
                                    href={erpLink(detail.erp_invoice_id)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-normal text-primary hover:underline"
                                >
                                    Buka di ERP <ExternalLink className="size-3" />
                                </a>
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    {detail && (
                        <div className="grid gap-5 text-sm">
                            {detailGroups.map((group) => (
                                <div key={group.title}>
                                    <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h4>
                                    <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                                        {group.fields.map(([label, key]) => (
                                            <div key={key} className="flex justify-between gap-3 border-b py-1">
                                                <span className="text-muted-foreground">{label}</span>
                                                <span className="text-right font-medium">{txt(detail[key])}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            <div>
                                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nilai</h4>
                                <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                                    {amountFields.map(([label, key]) => (
                                        <div key={key} className="flex justify-between gap-3 border-b py-1">
                                            <span className="text-muted-foreground">{label}</span>
                                            <span className="text-right font-medium">
                                                {key === 'disc' ? txt(detail[key]) : money(detail[key])}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
