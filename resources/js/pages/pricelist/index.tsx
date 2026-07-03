import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { History, Paperclip, Search } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Finance', href: '#' },
    { title: 'Pricelist', href: '/finance/pricelist' },
];

interface Attachment { id: number; kind: string; name: string }
interface Version {
    pricelist: number; effective_from: string | null; effective_to: string | null; is_active: boolean;
    approved_at: string | null; approved_by: string | null; submitted_at: string | null; submitted_by: string | null;
    note: string | null; decision_note: string | null; attachments: Attachment[];
}
interface Row {
    id: number; sku_code: string | null; product_name: string | null; principal: string | null; profile: string | null;
    pricelist: number; effective_from: string | null; effective_to: string | null; approved_at: string | null; approved_by: string | null; history: Version[];
}
interface Paginated<T> { data: T[]; links: { url: string | null; label: string; active: boolean }[] }
interface Props { rows: Paginated<Row>; filters: { q: string; principal: string }; principals: { id: number; name: string }[] }

const rupiah = (v: number) => 'Rp ' + Math.round(v).toLocaleString('id-ID');

export default function PricelistIndex({ rows, filters, principals }: Props) {
    const [q, setQ] = useState(filters.q);
    const [detail, setDetail] = useState<Row | null>(null);
    const apply = (extra: Record<string, string>) => router.get(route('pricelist.index'), { q, principal: filters.principal, ...extra }, { preserveState: true, replace: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Pricelist" />
            <div className="flex flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <form onSubmit={(e) => { e.preventDefault(); apply({}); }} className="relative">
                        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode / deskripsi…" className="h-9 w-60 rounded-md border border-input bg-background pl-7 pr-2 text-sm" />
                    </form>
                    <select value={filters.principal} onChange={(e) => apply({ principal: e.target.value })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="">Semua principal</option>
                        {principals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <span className="text-xs text-muted-foreground">Menampilkan harga yang berlaku (aktif)</span>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                    <table className="min-w-full text-sm">
                        <thead className="bg-muted/60"><tr>
                            <th className="px-2 py-1.5 text-left">Principal</th><th className="px-2 py-1.5 text-left">Kode</th><th className="px-2 py-1.5 text-left">Deskripsi</th>
                            <th className="px-2 py-1.5 text-left">Profil</th><th className="px-2 py-1.5 text-right">Harga Pricelist</th>
                            <th className="px-2 py-1.5 text-left">Berlaku Dari</th><th className="px-2 py-1.5 text-left">Sampai</th><th className="px-2 py-1.5 text-left">Disetujui</th><th className="px-2 py-1.5" />
                        </tr></thead>
                        <tbody>
                            {rows.data.map((r) => (
                                <tr key={r.id} className="border-t hover:bg-muted/30">
                                    <td className="px-2 py-1.5">{r.principal}</td>
                                    <td className="px-2 py-1.5">{r.sku_code}</td>
                                    <td className="px-2 py-1.5">{r.product_name}</td>
                                    <td className="px-2 py-1.5">{r.profile}</td>
                                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{rupiah(r.pricelist)}</td>
                                    <td className="px-2 py-1.5">{r.effective_from}</td>
                                    <td className="px-2 py-1.5"><span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">{r.effective_to ?? 'sekarang'}</span></td>
                                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{r.approved_at}<br />{r.approved_by}</td>
                                    <td className="px-2 py-1.5 text-right">
                                        <button onClick={() => setDetail(r)} title="Riwayat versi" className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800">
                                            <History className="h-4 w-4" />{r.history.length > 1 && <span className="text-[10px]">{r.history.length}</span>}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {rows.data.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Belum ada harga disetujui.</td></tr>}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-wrap gap-1">
                    {rows.links.map((l, i) => (
                        <button key={i} disabled={!l.url} onClick={() => l.url && router.visit(l.url, { preserveScroll: true })}
                            className={`rounded px-2 py-1 text-xs ${l.active ? 'bg-primary text-primary-foreground' : 'border'} ${!l.url ? 'opacity-40' : ''}`}
                            dangerouslySetInnerHTML={{ __html: l.label }} />
                    ))}
                </div>

                <p className="text-xs text-muted-foreground"><Link href={route('pricing-approval.index')} className="underline">← Persetujuan Harga</Link></p>
            </div>

            <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>Riwayat Harga — {detail?.sku_code}</DialogTitle></DialogHeader>
                    <div className="mb-1 text-xs text-muted-foreground">{detail?.product_name} · {detail?.profile}</div>
                    <div className="max-h-96 space-y-2 overflow-auto">
                        {detail?.history.map((h, i) => (
                            <div key={i} className={`rounded-md border p-2 text-xs ${h.is_active ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20' : ''}`}>
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold tabular-nums">{rupiah(h.pricelist)}</span>
                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${h.is_active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{h.is_active ? 'AKTIF' : 'NONAKTIF'}</span>
                                </div>
                                <div className="mt-0.5 text-muted-foreground">Berlaku {h.effective_from} s/d {h.effective_to ?? 'sekarang'}</div>
                                <div className="mt-0.5 text-muted-foreground">Diajukan {h.submitted_at} ({h.submitted_by}) · Disetujui {h.approved_at} ({h.approved_by})</div>
                                {h.note && <div className="mt-1"><b>Dasar:</b> {h.note}</div>}
                                {h.decision_note && <div className="mt-0.5"><b>Catatan:</b> {h.decision_note}</div>}
                                {h.attachments.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-2">
                                        {h.attachments.map((a) => (
                                            <a key={a.id} href={route('pricing-approval.download', a.id)} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 hover:bg-muted"><Paperclip className="h-3 w-3" /> {a.name} <span className="text-muted-foreground">({a.kind})</span></a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
