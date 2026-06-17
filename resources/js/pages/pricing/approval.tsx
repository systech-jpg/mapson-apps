import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { rupiah } from '@/lib/pricing';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Check, X } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Finance', href: '#' },
    { title: 'Persetujuan Harga', href: '/finance/pricing/approvals' },
];

interface Approval {
    id: string;
    old_price: string | number;
    new_price: string | number;
    new_values: Record<string, string | number | null>;
    created_at: string;
    product?: { sku_code: string; product_name: string; principal_name: string | null } | null;
    parameter?: { name: string } | null;
    requester?: { name: string } | null;
}

const pct = (v: string | number | null | undefined) => (v === null || v === undefined ? '-' : `${Number(v)}%`);

export default function PricingApproval({ approvals }: { approvals: Approval[] }) {
    const approve = (a: Approval) => {
        if (confirm(`Setujui harga baru ${a.product?.product_name}? Master produk akan diperbarui.`)) {
            router.post(route('pricing.approve', a.id), {}, { preserveScroll: true });
        }
    };
    const reject = (a: Approval) => {
        const note = window.prompt('Alasan penolakan (opsional):') ?? '';
        router.post(route('pricing.reject', a.id), { note }, { preserveScroll: true });
    };

    const delta = (a: Approval) => {
        const o = Number(a.old_price);
        const n = Number(a.new_price);
        if (!o) return null;
        return ((n - o) / o) * 100;
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Persetujuan Harga" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">Persetujuan Harga</h1>
                    <p className="text-sm text-muted-foreground">Tinjau usulan perubahan harga; setujui untuk merge ke master produk.</p>
                </div>

                {approvals.length === 0 ? (
                    <Card><CardContent className="py-12 text-center text-muted-foreground">Tidak ada pengajuan harga yang menunggu.</CardContent></Card>
                ) : (
                    <Card>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Produk</TableHead>
                                            <TableHead>Parameter</TableHead>
                                            <TableHead className="text-right">Harga Lama</TableHead>
                                            <TableHead className="text-right">Harga Baru</TableHead>
                                            <TableHead className="text-right">Δ</TableHead>
                                            <TableHead>Modifier (Disc/Opex/Profit/Komisi/Ship)</TableHead>
                                            <TableHead>Pemohon</TableHead>
                                            <TableHead className="text-right">Aksi</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {approvals.map((a) => {
                                            const d = delta(a);
                                            const v = a.new_values ?? {};
                                            return (
                                                <TableRow key={a.id}>
                                                    <TableCell>
                                                        <div className="font-medium">{a.product?.product_name ?? '-'}</div>
                                                        <div className="font-mono text-xs text-muted-foreground">{a.product?.sku_code} · {String(v.currency_code ?? '-')}</div>
                                                    </TableCell>
                                                    <TableCell className="text-xs">{a.parameter?.name ?? '-'}</TableCell>
                                                    <TableCell className="text-right font-mono">{rupiah(Number(a.old_price))}</TableCell>
                                                    <TableCell className="text-right font-mono font-semibold">{rupiah(Number(a.new_price))}</TableCell>
                                                    <TableCell className={`text-right font-mono ${d != null && d > 0 ? 'text-emerald-600' : d != null && d < 0 ? 'text-rose-600' : ''}`}>
                                                        {d == null ? '-' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs whitespace-nowrap">
                                                        {pct(v.principal_disc_pct)} / {pct(v.opex_pct)} / {pct(v.profit_pct)} / {pct(v.comm_pct)} / {pct(v.ship_sales_pct)}
                                                    </TableCell>
                                                    <TableCell className="text-xs">{a.requester?.name ?? '-'}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button size="sm" className="h-7" onClick={() => approve(a)}><Check className="size-4" /> Setujui</Button>
                                                            <Button size="sm" variant="outline" className="h-7 text-rose-600" onClick={() => reject(a)}><X className="size-4" /> Tolak</Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </AppLayout>
    );
}
