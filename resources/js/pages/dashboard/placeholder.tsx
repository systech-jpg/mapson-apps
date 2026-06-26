import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import DashboardLayout from '@/layouts/dashboard-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';

type Section = 'stock' | 'cost';

interface Bar {
    label: string;
    value: number;
}

interface Kpi {
    label: string;
    value: string;
    sub: string;
    accent?: boolean;
}

const rpC = (n: number) => {
    const x = Number(n || 0);
    if (Math.abs(x) >= 1e9) return 'Rp ' + (x / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (Math.abs(x) >= 1e6) return 'Rp ' + (x / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return 'Rp ' + x.toLocaleString('id-ID');
};

const CONTENT: Record<Section, { title: string; desc: string; color: string; kpis: Kpi[]; chartTitle: string; bars: Bar[] }> = {
    stock: {
        title: 'Stock',
        desc: 'Tingkat & nilai persediaan dari data ERP (segera).',
        color: 'bg-emerald-500',
        kpis: [
            { label: 'Total SKU', value: '1.248', sub: 'produk aktif' },
            { label: 'Nilai Persediaan', value: 'Rp 8,1 M', sub: 'harga pokok' },
            { label: 'Stok Menipis', value: '37', sub: 'di bawah titik pesan ulang', accent: true },
            { label: 'Stok Mati (>180 hari)', value: '12', sub: 'perlu tindakan' },
        ],
        chartTitle: 'Nilai Persediaan per Kategori',
        bars: [
            { label: 'Implant Tulang', value: 3_420_000_000 },
            { label: 'Consumables', value: 2_150_000_000 },
            { label: 'Instrumen', value: 1_380_000_000 },
            { label: 'Alat Bantu', value: 760_000_000 },
            { label: 'Lain-lain', value: 410_000_000 },
        ],
    },
    cost: {
        title: 'Cost',
        desc: 'Biaya & beban operasional dari data ERP (segera).',
        color: 'bg-rose-500',
        kpis: [
            { label: 'Total Biaya (bulan ini)', value: 'Rp 1,24 M', sub: 'seluruh kategori' },
            { label: 'HPP / COGS', value: 'Rp 9,8 M', sub: 'tahun berjalan' },
            { label: 'Margin Kotor', value: '42%', sub: 'penjualan vs HPP' },
            { label: 'Beban Gaji', value: 'Rp 640 jt', sub: 'bulan ini', accent: true },
        ],
        chartTitle: 'Biaya per Kategori',
        bars: [
            { label: 'Gaji & Tunjangan', value: 640_000_000 },
            { label: 'Operasional Kantor', value: 210_000_000 },
            { label: 'Logistik / Pengiriman', value: 175_000_000 },
            { label: 'Marketing', value: 120_000_000 },
            { label: 'Penyusutan', value: 95_000_000 },
        ],
    },
};

export default function Placeholder({ section }: { section: Section }) {
    const c = CONTENT[section];
    const breadcrumbs: BreadcrumbItem[] = [{ title: c.title, href: `/dashboard/${section}` }];
    const max = Math.max(...c.bars.map((b) => b.value), 1);

    return (
        <DashboardLayout breadcrumbs={breadcrumbs}>
            <Head title={c.title} />
            <div className="flex flex-1 flex-col gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">{c.title}</h1>
                    <p className="text-sm text-muted-foreground">{c.desc}</p>
                </div>

                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    Konten masih <b>dummy</b> — menunggu integrasi sumber data. Strukturnya sudah siap untuk diisi.
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {c.kpis.map((k) => (
                        <Card key={k.label} className={k.accent ? 'border-amber-300 dark:border-amber-800' : ''}>
                            <CardContent className="p-4">
                                <p className="text-xs text-muted-foreground">{k.label}</p>
                                <p className={`mt-1 text-2xl font-bold ${k.accent ? 'text-amber-600 dark:text-amber-400' : ''}`}>{k.value}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{k.sub}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">{c.chartTitle}</CardTitle></CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {c.bars.map((b) => (
                                <div key={b.label}>
                                    <div className="flex justify-between gap-2 text-xs">
                                        <span className="truncate" title={b.label}>{b.label}</span>
                                        <span className="shrink-0 font-medium">{rpC(b.value)}</span>
                                    </div>
                                    <div className="mt-0.5 h-2 w-full rounded bg-muted">
                                        <div className={`h-2 rounded ${c.color}`} style={{ width: `${(b.value / max) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}
