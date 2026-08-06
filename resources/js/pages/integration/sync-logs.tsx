import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integrasi Data', href: '#' },
    { title: 'Log Sinkronisasi', href: '/integration/sync-logs' },
];

interface Log {
    id: number; channel: string; source: string; status: string; rows: number | null;
    summary: string | null; message: string | null; duration_ms: number | null; trigger: string; user: string | null; at: string | null;
}
interface Paginated<T> { data: T[]; links: { url: string | null; label: string; active: boolean }[] }
interface Props { logs: Paginated<Log>; filters: { channel: string; status: string } }

const CHANNEL_STYLE: Record<string, string> = {
    erp: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    accurate: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    hadirr: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
};
const dur = (ms: number | null) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
// Istilah "Accurate" disembunyikan dari UI (kebijakan manajemen). Log lama di DB masih
// menyimpan label aslinya, jadi dibersihkan saat render — jangan ubah datanya.
const hide = (s: string | null) => (s == null ? s : s.replace(/accurate/gi, 'Manual Import'));

export default function SyncLogsIndex({ logs, filters }: Props) {
    const apply = (extra: Record<string, string>) => router.get(route('integration.logs'), { ...filters, ...extra }, { preserveState: true, replace: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Log Sinkronisasi" />
            <div className="flex flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <select value={filters.channel} onChange={(e) => apply({ channel: e.target.value })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="">Semua channel</option>
                        <option value="erp">ERP</option>
                        <option value="accurate">Manual Import</option>
                        <option value="hadirr">Hadirr</option>
                    </select>
                    <select value={filters.status} onChange={(e) => apply({ status: e.target.value })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="">Semua status</option>
                        <option value="success">Success</option>
                        <option value="failed">Failed</option>
                    </select>
                    <span className="text-xs text-muted-foreground">Riwayat sinkronisasi ERP / Manual Import / Hadirr (jadwal & manual)</span>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                    <table className="min-w-full text-sm">
                        <thead className="bg-muted/60"><tr>
                            <th className="px-2 py-1.5 text-left">Waktu</th><th className="px-2 py-1.5 text-left">Channel</th><th className="px-2 py-1.5 text-left">Job</th>
                            <th className="px-2 py-1.5 text-center">Status</th><th className="px-2 py-1.5 text-right">Baris</th><th className="px-2 py-1.5 text-right">Durasi</th>
                            <th className="px-2 py-1.5 text-left">Trigger</th><th className="px-2 py-1.5 text-left">User</th><th className="px-2 py-1.5 text-left">Detail</th>
                        </tr></thead>
                        <tbody>
                            {logs.data.map((l) => (
                                <tr key={l.id} className="border-t align-top hover:bg-muted/30">
                                    <td className="whitespace-nowrap px-2 py-1.5 text-xs text-muted-foreground">{l.at}</td>
                                    <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${CHANNEL_STYLE[l.channel] ?? 'bg-muted'}`}>{hide(l.channel)}</span></td>
                                    <td className="px-2 py-1.5">{hide(l.source)}</td>
                                    <td className="px-2 py-1.5 text-center">
                                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${l.status === 'success' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>{l.status}</span>
                                    </td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{l.rows ?? '—'}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{dur(l.duration_ms)}</td>
                                    <td className="px-2 py-1.5 text-xs">{l.trigger === 'schedule' ? <span className="text-sky-700 dark:text-sky-300">terjadwal</span> : 'manual'}</td>
                                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{l.user ?? '—'}</td>
                                    <td className="max-w-md px-2 py-1.5 text-xs">
                                        {l.status === 'failed'
                                            ? <span className="text-red-600 dark:text-red-400">{hide(l.message)}</span>
                                            : <span className="break-all text-muted-foreground">{hide(l.summary)}</span>}
                                    </td>
                                </tr>
                            ))}
                            {logs.data.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Belum ada log sinkronisasi.</td></tr>}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-wrap gap-1">
                    {logs.links.map((l, i) => (
                        <button key={i} disabled={!l.url} onClick={() => l.url && router.visit(l.url, { preserveScroll: true })}
                            className={`rounded px-2 py-1 text-xs ${l.active ? 'bg-primary text-primary-foreground' : 'border'} ${!l.url ? 'opacity-40' : ''}`}
                            dangerouslySetInnerHTML={{ __html: l.label }} />
                    ))}
                </div>
            </div>
        </AppLayout>
    );
}
