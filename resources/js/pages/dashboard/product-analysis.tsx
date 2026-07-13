import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import DashboardLayout from '@/layouts/dashboard-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Download, LoaderCircle, Plus, Trash2 } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Analisa Produk', href: '/dashboard/analisa-produk' }];

interface Bar {
    label: string;
    value: number;
}

interface ProductRow {
    label: string;
    principal: string | null;
    items: number;
    salesQty: number;
    salesDpp: number;
    cogs: number;
    cogsComplete: boolean;
    gross: number;
    expenses: number;
    contribution: number;
    stockQty: number;
    stockValue: number | null;
}

interface ItemRow {
    id: number;
    item_no: string;
    item_name: string | null;
    product_label: string;
    principal: string | null;
    source: string;
    stock_qty: number;
    avg_cost: number | null;
    stock_value: number | null;
    sold_qty: number;
    sold_dpp: number;
}

interface ExpenseRow {
    id: number;
    expense_date: string;
    product_label: string | null;
    category: string;
    description: string | null;
    amount: number;
}

interface PurchaseRow {
    id: number;
    doc_number: string | null;
    trans_date: string | null;
    vendor_name: string | null;
    item_no: string | null;
    item_name: string | null;
    qty: number;
    unit_price: number;
    total: number;
}

interface Props {
    years: string[];
    year: string;
    productOptions: string[];
    expenseCategories: string[];
    hasMapping: boolean;
    products: ProductRow[];
    items: ItemRow[];
    trend: { month: string; sales: Record<string, number>; stockIn: number; stockOut: number }[];
    expenses: ExpenseRow[];
    generalExpenses: number;
    expenseByCategory: Bar[];
    purchases: PurchaseRow[];
    lastPurchaseSync: string | null;
}

const rp = (n: number) => 'Rp ' + Math.round(Number(n || 0)).toLocaleString('id-ID');
const rpC = (n: number) => {
    const x = Number(n || 0);
    if (Math.abs(x) >= 1e9) return 'Rp ' + (x / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (Math.abs(x) >= 1e6) return 'Rp ' + (x / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return 'Rp ' + x.toLocaleString('id-ID');
};
const qtyFmt = (n: number) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const dateFmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '–');

const PRODUCT_COLORS = ['bg-primary', 'bg-sky-500', 'bg-violet-500', 'bg-emerald-500'];
const GENERAL = '__umum__';

function BarList({ items, color = 'bg-primary' }: { items: Bar[]; color?: string }) {
    const max = Math.max(...items.map((i) => i.value), 1);
    if (items.length === 0) return <p className="text-sm text-muted-foreground">Belum ada data.</p>;
    return (
        <div className="space-y-2">
            {items.map((it, idx) => (
                <div key={it.label + idx}>
                    <div className="flex justify-between gap-2 text-xs">
                        <span className="truncate" title={it.label}>{it.label}</span>
                        <span className="shrink-0 font-medium">{rpC(it.value)}</span>
                    </div>
                    <div className="mt-0.5 h-2 w-full rounded bg-muted">
                        <div className={`h-2 rounded ${color}`} style={{ width: `${(it.value / max) * 100}%` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function SalesTrend({ trend, labels }: { trend: Props['trend']; labels: string[] }) {
    const max = Math.max(...trend.flatMap((t) => labels.map((l) => t.sales[l] ?? 0)), 1);
    return (
        <div>
            <div className="mb-2 flex flex-wrap items-center gap-4 text-xs">
                {labels.map((l, i) => (
                    <span key={l} className="flex items-center gap-1.5">
                        <span className={`size-3 rounded-sm ${PRODUCT_COLORS[i % PRODUCT_COLORS.length]}`} /> {l}
                    </span>
                ))}
            </div>
            <div className="flex h-48 items-end gap-1">
                {trend.map((t) => (
                    <div key={t.month} className="flex flex-1 flex-col items-center gap-1" title={labels.map((l) => `${l}: ${rp(t.sales[l] ?? 0)}`).join(' · ')}>
                        <div className="flex h-40 w-full items-end justify-center gap-0.5">
                            {labels.map((l, i) => (
                                <div
                                    key={l}
                                    className={`w-full rounded-t ${PRODUCT_COLORS[i % PRODUCT_COLORS.length]}`}
                                    style={{ height: `${((t.sales[l] ?? 0) / max) * 100}%` }}
                                />
                            ))}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{t.month}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MovementTrend({ trend }: { trend: Props['trend'] }) {
    const max = Math.max(...trend.flatMap((t) => [t.stockIn, t.stockOut]), 1);
    return (
        <div>
            <div className="mb-2 flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-emerald-500" /> Masuk</span>
                <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-red-400" /> Keluar</span>
            </div>
            <div className="flex h-48 items-end gap-1">
                {trend.map((t) => (
                    <div key={t.month} className="flex flex-1 flex-col items-center gap-1" title={`${t.month}: masuk ${rp(t.stockIn)} · keluar ${rp(t.stockOut)}`}>
                        <div className="flex h-40 w-full items-end justify-center gap-0.5">
                            <div className="w-1/2 rounded-t bg-emerald-500" style={{ height: `${(t.stockIn / max) * 100}%` }} />
                            <div className="w-1/2 rounded-t bg-red-400" style={{ height: `${(t.stockOut / max) * 100}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{t.month}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function ProductAnalysis(props: Props) {
    const { years, year, productOptions, expenseCategories, hasMapping, products, items, trend, expenses, generalExpenses, expenseByCategory, purchases, lastPurchaseSync } = props;

    const setYear = (y: string) => router.get(route('dashboard.product'), { year: y }, { preserveState: true, preserveScroll: true, replace: true });

    const sync = useForm({ from: `${year}-01-01`, to: new Date().toISOString().slice(0, 10) });
    const pull = () => sync.post(route('dashboard.product.sync'), { preserveScroll: true });

    const expense = useForm({ expense_date: new Date().toISOString().slice(0, 10), product_label: GENERAL, category: expenseCategories[0] ?? 'Lainnya', description: '', amount: '' });
    const addExpense = () => {
        expense.transform((d) => ({ ...d, product_label: d.product_label === GENERAL ? '' : d.product_label }));
        expense.post(route('dashboard.product.expenses.store'), {
            preserveScroll: true,
            onSuccess: () => expense.reset('description', 'amount'),
        });
    };

    const mapping = useForm({ item_no: '', product_label: productOptions[0] ?? '' });
    const addMapping = () => mapping.post(route('dashboard.product.mapping.store'), { preserveScroll: true, onSuccess: () => mapping.reset('item_no') });

    const del = (routeName: string, id: number, label: string) => {
        if (confirm(`Hapus ${label}?`)) {
            router.delete(route(routeName, id), { preserveScroll: true });
        }
    };

    const labels = products.map((p) => p.label);
    const totalStockValue = products.some((p) => p.stockValue === null) ? null : products.reduce((s, p) => s + (p.stockValue ?? 0), 0);

    return (
        <DashboardLayout breadcrumbs={breadcrumbs}>
            <Head title="Analisa Produk" />
            <div className="flex flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-semibold">
                            Analisa Produk <Badge variant="outline">Trial</Badge>
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            P&amp;L per produk principal (Phytocemindo): penjualan − HPP estimasi − biaya lain-lain, plus nilai &amp; mutasi stok.
                        </p>
                    </div>
                    <Select value={year} onValueChange={setYear}>
                        <SelectTrigger className="w-28">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {years.map((y) => (
                                <SelectItem key={y} value={y}>{y}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Sync harga beli (basis HPP) */}
                <Card>
                    <CardContent className="flex flex-wrap items-end gap-3 p-4">
                        <div className="grid gap-1">
                            <Label htmlFor="pa-from" className="text-xs">Dari</Label>
                            <Input id="pa-from" type="date" className="w-40" value={sync.data.from} onChange={(e) => sync.setData('from', e.target.value)} />
                        </div>
                        <div className="grid gap-1">
                            <Label htmlFor="pa-to" className="text-xs">Sampai</Label>
                            <Input id="pa-to" type="date" className="w-40" value={sync.data.to} onChange={(e) => sync.setData('to', e.target.value)} />
                        </div>
                        <Button onClick={pull} disabled={sync.processing}>
                            {sync.processing ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                            {sync.processing ? 'Menarik…' : 'Deteksi Item + Tarik Harga Beli'}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            Mendeteksi item Colarose/Boneguard dari data Accurate yang sudah ada, lalu menarik faktur pembeliannya sebagai basis HPP.
                            {lastPurchaseSync && <> Terakhir ditarik: {dateFmt(lastPurchaseSync)}.</>}
                        </p>
                    </CardContent>
                </Card>

                {!hasMapping ? (
                    <Card>
                        <CardContent className="flex h-48 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                            <p>Belum ada item yang ter-mapping ke produk analisa.</p>
                            <p className="text-sm">Klik "Deteksi Item + Tarik Harga Beli" di atas, atau tambahkan mapping manual di bagian bawah halaman.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        {/* Ringkasan P&L per produk */}
                        <div className="grid gap-3 lg:grid-cols-2">
                            {products.map((p, i) => (
                                <Card key={p.label}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="flex items-center gap-2 text-base">
                                            <span className={`size-3 rounded-sm ${PRODUCT_COLORS[i % PRODUCT_COLORS.length]}`} />
                                            {p.label}
                                            <span className="text-xs font-normal text-muted-foreground">{p.principal} · {p.items} item · {year}</span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-1 text-sm">
                                        <div className="flex justify-between"><span>Penjualan (DPP)</span><span className="font-medium">{rp(p.salesDpp)}</span></div>
                                        <div className="flex justify-between text-muted-foreground">
                                            <span>HPP estimasi {!p.cogsComplete && <span className="text-amber-600">(belum lengkap)</span>}</span>
                                            <span>− {rp(p.cogs)}</span>
                                        </div>
                                        <div className="flex justify-between border-t pt-1"><span>Margin kotor</span><span className={`font-medium ${p.gross < 0 ? 'text-red-600' : ''}`}>{rp(p.gross)}</span></div>
                                        <div className="flex justify-between text-muted-foreground"><span>Biaya lain-lain (produk)</span><span>− {rp(p.expenses)}</span></div>
                                        <div className="flex justify-between border-t pt-1 text-base font-semibold">
                                            <span>Margin kontribusi</span>
                                            <span className={p.contribution < 0 ? 'text-red-600' : 'text-emerald-600'}>
                                                {rp(p.contribution)}
                                                {p.salesDpp > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">({((p.contribution / p.salesDpp) * 100).toFixed(1)}%)</span>}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex justify-between rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                                            <span>Qty terjual: {qtyFmt(p.salesQty)}</span>
                                            <span>Stok: {qtyFmt(p.stockQty)} ({p.stockValue === null ? 'nilai belum ada' : rpC(p.stockValue)})</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {generalExpenses > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Ada biaya "Umum" {rp(generalExpenses)} pada {year} yang belum dialokasikan ke produk tertentu (tidak dihitung dalam margin kontribusi di atas).
                            </p>
                        )}

                        {/* Tren */}
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-base">Penjualan (DPP) per Bulan · {year}</CardTitle></CardHeader>
                                <CardContent><SalesTrend trend={trend} labels={labels} /></CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Mutasi Stok per Bulan (nilai, basis HPP) · {year}</CardTitle>
                                </CardHeader>
                                <CardContent><MovementTrend trend={trend} /></CardContent>
                            </Card>
                        </div>

                        {/* Detail per item */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">
                                    Stok &amp; Nilai per Item
                                    {totalStockValue !== null && <span className="ml-2 text-sm font-normal text-muted-foreground">total nilai stok {rp(totalStockValue)}</span>}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Item</TableHead>
                                                <TableHead>Produk</TableHead>
                                                <TableHead className="text-right">Terjual {year}</TableHead>
                                                <TableHead className="text-right">Penjualan (DPP)</TableHead>
                                                <TableHead className="text-right">Stok</TableHead>
                                                <TableHead className="text-right">HPP rata-rata</TableHead>
                                                <TableHead className="text-right">Nilai Stok</TableHead>
                                                <TableHead />
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {items.map((it) => (
                                                <TableRow key={it.id}>
                                                    <TableCell>
                                                        <div className="font-medium">{it.item_no}</div>
                                                        <div className="max-w-72 truncate text-xs text-muted-foreground" title={it.item_name ?? ''}>{it.item_name}</div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {it.product_label}
                                                        {it.source === 'manual' && <Badge variant="secondary" className="ml-1 text-[10px]">manual</Badge>}
                                                    </TableCell>
                                                    <TableCell className="text-right">{qtyFmt(it.sold_qty)}</TableCell>
                                                    <TableCell className="text-right">{rpC(it.sold_dpp)}</TableCell>
                                                    <TableCell className="text-right">{qtyFmt(it.stock_qty)}</TableCell>
                                                    <TableCell className="text-right">{it.avg_cost === null ? <span className="text-amber-600">belum ada</span> : rp(it.avg_cost)}</TableCell>
                                                    <TableCell className="text-right">{it.stock_value === null ? '–' : rpC(it.stock_value)}</TableCell>
                                                    <TableCell>
                                                        <Button variant="ghost" size="icon" className="size-7" onClick={() => del('dashboard.product.mapping.destroy', it.id, `mapping ${it.item_no}`)}>
                                                            <Trash2 className="size-3.5 text-muted-foreground" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}

                {/* Biaya lain-lain */}
                <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-2"><CardTitle className="text-base">Biaya Lain-lain · {year}</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap items-end gap-2">
                                <div className="grid gap-1">
                                    <Label className="text-xs">Tanggal</Label>
                                    <Input type="date" className="w-36" value={expense.data.expense_date} onChange={(e) => expense.setData('expense_date', e.target.value)} />
                                </div>
                                <div className="grid gap-1">
                                    <Label className="text-xs">Produk</Label>
                                    <Select value={expense.data.product_label} onValueChange={(v) => expense.setData('product_label', v)}>
                                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={GENERAL}>Umum</SelectItem>
                                            {productOptions.map((p) => (
                                                <SelectItem key={p} value={p}>{p}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-1">
                                    <Label className="text-xs">Kategori</Label>
                                    <Select value={expense.data.category} onValueChange={(v) => expense.setData('category', v)}>
                                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {expenseCategories.map((c) => (
                                                <SelectItem key={c} value={c}>{c}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-1">
                                    <Label className="text-xs">Keterangan</Label>
                                    <Input className="w-48" placeholder="opsional" value={expense.data.description} onChange={(e) => expense.setData('description', e.target.value)} />
                                </div>
                                <div className="grid gap-1">
                                    <Label className="text-xs">Jumlah (Rp)</Label>
                                    <Input type="number" min="0" className="w-36" value={expense.data.amount} onChange={(e) => expense.setData('amount', e.target.value)} />
                                </div>
                                <Button onClick={addExpense} disabled={expense.processing || !expense.data.amount}>
                                    <Plus className="size-4" /> Catat
                                </Button>
                            </div>
                            {expense.errors.amount && <p className="text-xs text-red-600">{expense.errors.amount}</p>}

                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Tanggal</TableHead>
                                            <TableHead>Produk</TableHead>
                                            <TableHead>Kategori</TableHead>
                                            <TableHead>Keterangan</TableHead>
                                            <TableHead className="text-right">Jumlah</TableHead>
                                            <TableHead />
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {expenses.length === 0 && (
                                            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Belum ada biaya tercatat untuk {year}.</TableCell></TableRow>
                                        )}
                                        {expenses.map((e) => (
                                            <TableRow key={e.id}>
                                                <TableCell>{dateFmt(e.expense_date)}</TableCell>
                                                <TableCell>{e.product_label ?? <span className="text-muted-foreground">Umum</span>}</TableCell>
                                                <TableCell>{e.category}</TableCell>
                                                <TableCell className="max-w-64 truncate" title={e.description ?? ''}>{e.description}</TableCell>
                                                <TableCell className="text-right font-medium">{rp(e.amount)}</TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" className="size-7" onClick={() => del('dashboard.product.expenses.destroy', e.id, 'biaya ini')}>
                                                        <Trash2 className="size-3.5 text-muted-foreground" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-base">Biaya per Kategori · {year}</CardTitle></CardHeader>
                        <CardContent><BarList items={expenseByCategory} color="bg-amber-500" /></CardContent>
                    </Card>
                </div>

                {/* Pembelian terakhir + mapping manual */}
                <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-2"><CardTitle className="text-base">Pembelian Terakhir (basis HPP)</CardTitle></CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Tanggal</TableHead>
                                            <TableHead>No. Faktur</TableHead>
                                            <TableHead>Vendor</TableHead>
                                            <TableHead>Item</TableHead>
                                            <TableHead className="text-right">Qty</TableHead>
                                            <TableHead className="text-right">Harga Satuan</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {purchases.length === 0 && (
                                            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Belum ada data pembelian — klik tombol tarik di atas.</TableCell></TableRow>
                                        )}
                                        {purchases.map((p) => (
                                            <TableRow key={p.id}>
                                                <TableCell>{dateFmt(p.trans_date)}</TableCell>
                                                <TableCell>{p.doc_number}</TableCell>
                                                <TableCell className="max-w-40 truncate" title={p.vendor_name ?? ''}>{p.vendor_name}</TableCell>
                                                <TableCell className="max-w-56 truncate" title={p.item_name ?? ''}>{p.item_no} — {p.item_name}</TableCell>
                                                <TableCell className="text-right">{qtyFmt(p.qty)}</TableCell>
                                                <TableCell className="text-right">{rp(p.unit_price)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-base">Tambah Mapping Manual</CardTitle></CardHeader>
                        <CardContent className="space-y-2">
                            <p className="text-xs text-muted-foreground">Untuk item yang tidak terdeteksi otomatis dari nama produk.</p>
                            <div className="grid gap-1">
                                <Label className="text-xs">Kode Item (Accurate)</Label>
                                <Input value={mapping.data.item_no} onChange={(e) => mapping.setData('item_no', e.target.value)} placeholder="mis. CLR-001" />
                                {mapping.errors.item_no && <p className="text-xs text-red-600">{mapping.errors.item_no}</p>}
                            </div>
                            <div className="grid gap-1">
                                <Label className="text-xs">Produk</Label>
                                <Select value={mapping.data.product_label} onValueChange={(v) => mapping.setData('product_label', v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {productOptions.map((p) => (
                                            <SelectItem key={p} value={p}>{p}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button onClick={addMapping} disabled={mapping.processing || !mapping.data.item_no} className="w-full">
                                <Plus className="size-4" /> Tambah
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    );
}
