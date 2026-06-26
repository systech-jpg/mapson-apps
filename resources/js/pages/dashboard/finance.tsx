import { DrilldownDialog, type DrillFilter } from '@/components/drilldown-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import DashboardLayout from '@/layouts/dashboard-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Finance', href: '/dashboard/finance' }];

interface Bar {
    label: string;
    value: number;
}

interface Props {
    hasData: boolean;
    ar: { paid: number; outstanding: number; collectionRate: number; aging: Bar[] };
}

const AGING_KEYS = ['belum', '1-30', '31-60', '61-90', '90plus'];

const rpC = (n: number) => {
    const x = Number(n || 0);
    if (Math.abs(x) >= 1e9) return 'Rp ' + (x / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (Math.abs(x) >= 1e6) return 'Rp ' + (x / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return 'Rp ' + x.toLocaleString('id-ID');
};

function Kpi({ label, value, sub, accent, onClick }: { label: string; value: string; sub?: string; accent?: boolean; onClick?: () => void }) {
    return (
        <Card className={`${accent ? 'border-amber-300 dark:border-amber-800' : ''} ${onClick ? 'cursor-pointer transition-colors hover:bg-accent/40' : ''}`} onClick={onClick}>
            <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`mt-1 text-2xl font-bold ${accent ? 'text-amber-600 dark:text-amber-400' : ''}`}>{value}</p>
                {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
            </CardContent>
        </Card>
    );
}

function BarList({ items, onItem }: { items: Bar[]; onItem?: (item: Bar, index: number) => void }) {
    const max = Math.max(...items.map((i) => i.value), 1);
    if (items.length === 0) return <p className="text-sm text-muted-foreground">Tidak ada data.</p>;
    return (
        <div className="space-y-2">
            {items.map((it, idx) => (
                <div key={it.label + idx} className={onItem ? 'cursor-pointer rounded p-1 -mx-1 hover:bg-accent/50' : ''} onClick={onItem ? () => onItem(it, idx) : undefined}>
                    <div className="flex justify-between gap-2 text-xs">
                        <span className="truncate" title={it.label}>{it.label}</span>
                        <span className="shrink-0 font-medium">{rpC(it.value)}</span>
                    </div>
                    <div className="mt-0.5 h-2 w-full rounded bg-muted">
                        <div className="h-2 rounded bg-amber-500" style={{ width: `${(it.value / max) * 100}%` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function Finance({ hasData, ar }: Props) {
    const [drill, setDrill] = useState<DrillFilter | null>(null);

    return (
        <DashboardLayout breadcrumbs={breadcrumbs}>
            <Head title="Finance" />
            <div className="flex flex-1 flex-col gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">Finance</h1>
                    <p className="text-sm text-muted-foreground">Piutang & penagihan dari data ERP. Klik angka / batang untuk lihat detail.</p>
                </div>

                {!hasData ? (
                    <Card>
                        <CardContent className="flex h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                            <p>Belum ada data penjualan.</p>
                            <p className="text-sm">Buka menu Integrasi Data lalu klik "Sinkronkan dari ERP".</p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Kpi label="Collection Rate" value={`${ar.collectionRate}%`} sub="rasio tertagih — klik detail" onClick={() => setDrill({ view: 'collection' })} />
                            <Kpi label="Terbayar" value={rpC(ar.paid)} sub="total pembayaran masuk" onClick={() => setDrill({ view: 'collection' })} />
                            <Kpi label="Piutang (Outstanding)" value={rpC(ar.outstanding)} sub="seluruh periode — klik detail" accent onClick={() => setDrill({ status: 'UNPAID' })} />
                            <Kpi label="Total Tagihan" value={rpC(ar.paid + ar.outstanding)} sub="terbayar + outstanding" />
                        </div>

                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-base">Aging Piutang</CardTitle></CardHeader>
                            <CardContent><BarList items={ar.aging} onItem={(_, idx) => setDrill({ aging: AGING_KEYS[idx] })} /></CardContent>
                        </Card>
                    </>
                )}
            </div>

            <DrilldownDialog filter={drill} onClose={() => setDrill(null)} />
        </DashboardLayout>
    );
}
