import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import DashboardLayout from '@/layouts/dashboard-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Analisa', href: '/analytics' }];

const sections = [
    { title: 'Penjualan: Total & Tren', desc: 'Revenue per periode, tren, target vs realisasi.' },
    { title: 'Penjualan: Breakdown', desc: 'Produk terlaris, per sales/customer, per cabang.' },
    { title: 'Stok: Level & Nilai', desc: 'Jumlah & nilai stok, low-stock alert.' },
    { title: 'Stok: Pergerakan', desc: 'Barang masuk/keluar, perputaran stok.' },
];

export default function Analytics() {
    return (
        <DashboardLayout breadcrumbs={breadcrumbs}>
            <Head title="Analisa" />
            <div className="flex flex-1 flex-col gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">Analisa</h1>
                    <p className="text-sm text-muted-foreground">Analisa mendalam penjualan & stok dari data ERP (segera).</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    {sections.map((s) => (
                        <Card key={s.title}>
                            <CardHeader>
                                <CardTitle className="text-base">{s.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="flex h-48 items-center justify-center text-center text-sm text-muted-foreground">
                                {s.desc}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </DashboardLayout>
    );
}
