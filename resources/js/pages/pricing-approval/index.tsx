import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Check, Eye, Paperclip, X } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Finance', href: '#' },
    { title: 'Persetujuan Harga', href: '/finance/pricing-approval' },
];

interface Detail {
    brand: string | null; category: string[]; product_type: string | null; currency_code: string | null;
    price_principle: number; disc_principle_pct: number; kurs: number;
    qty_beli: number; uom_beli: string | null; qty_jual: number; uom_jual: string | null;
    bm_pct: number; pph22_pct: number; ppn_pct: number; shipment_pct: number;
    ops_pct: number; profit_pct: number; komisi_pct: number; event_pct: number; lainnya_pct: number; buffer_pct: number;
    breakdown: Record<string, number> | null;
    changes: Record<string, [number, number]> | null;
    pricelist_before: number | null;
}
interface Item { id: number; status: string; sku_code: string | null; product_name: string | null; pricelist: number; detail: Detail | null }
interface Attachment { id: number; kind: string; name: string }
interface Submission {
    id: number; status: string; principal: string | null; profile: string | null; hospital: string | null;
    note: string | null; decision_note: string | null; submitter: string | null; decider: string | null;
    submitted_at: string | null; decided_at: string | null; items: Item[]; attachments: Attachment[];
}
interface Props { submissions: Submission[]; tab: string }

const rupiah = (v: number) => 'Rp ' + Math.round(v).toLocaleString('id-ID');

const STATUS_STYLE: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    partial: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
};
const Badge = ({ s }: { s: string }) => <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[s] ?? 'bg-muted'}`}>{s}</span>;

export default function PricingApprovalIndex({ submissions, tab }: Props) {
    const [view, setView] = useState<Item | null>(null);
    const setTab = (t: string) => router.get(route('pricing-approval.index'), { tab: t }, { preserveScroll: true });
    const approve = (s: Submission) => { if (window.confirm(`Setujui pengajuan ${s.principal} · ${s.profile}?`)) router.post(route('pricing-approval.approve', s.id), {}, { preserveScroll: true }); };
    const reject = (s: Submission) => { const note = window.prompt('Alasan penolakan:'); if (note !== null) router.post(route('pricing-approval.reject', s.id), { decision_note: note }, { preserveScroll: true }); };
    const decideItem = (it: Item, decision: 'approved' | 'rejected') => router.post(route('pricing-approval.item', it.id), { decision }, { preserveScroll: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Persetujuan Harga" />
            <div className="flex flex-col gap-4 p-4">
                <div className="flex flex-wrap gap-2">
                    {[['pending', 'Menunggu'], ['history', 'Riwayat']].map(([k, label]) => (
                        <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 text-sm ${tab === k ? 'bg-primary text-primary-foreground' : 'border'}`}>{label}</button>
                    ))}
                </div>

                {submissions.length === 0 && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Tidak ada pengajuan.</div>}

                {submissions.map((s) => (
                    <div key={s.id} className="rounded-lg border">
                        <div className="flex flex-col gap-1 border-b bg-muted/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <Badge s={s.status} />
                                <b className="break-words">{s.principal}</b> · {s.profile} · <span className={s.hospital ? 'text-sky-700 dark:text-sky-300' : 'text-muted-foreground'}>{s.hospital ?? 'Semua RS'}</span>
                                <span className="text-muted-foreground">— {s.items.length} item</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                <span>Diajukan {s.submitted_at} oleh {s.submitter}</span>
                                {s.decided_at && <span>· Diputuskan {s.decided_at} oleh {s.decider}</span>}
                            </div>
                        </div>

                        <div className="space-y-3 p-3">
                            {s.note && <div className="rounded bg-muted/40 px-2 py-1 text-xs"><b>Dasar:</b> {s.note}</div>}
                            {s.decision_note && <div className="rounded bg-muted/40 px-2 py-1 text-xs"><b>Catatan keputusan:</b> {s.decision_note}</div>}

                            {s.attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 text-xs">
                                    {s.attachments.map((a) => (
                                        <a key={a.id} href={route('pricing-approval.download', a.id)} className="inline-flex items-center gap-1 rounded border px-2 py-1 hover:bg-muted">
                                            <Paperclip className="h-3 w-3" /> {a.name} <span className="text-muted-foreground">({a.kind})</span>
                                        </a>
                                    ))}
                                </div>
                            )}

                            <div className="overflow-x-auto rounded border">
                                <table className="min-w-full text-xs">
                                    <thead className="bg-muted/60"><tr>
                                        <th className="px-2 py-1 text-left">Kode</th><th className="px-2 py-1 text-left">Deskripsi</th>
                                        <th className="px-2 py-1 text-right">Harga Pricelist</th><th className="px-2 py-1 text-center">Status</th><th className="px-2 py-1" />
                                    </tr></thead>
                                    <tbody>
                                        {s.items.map((it) => (
                                            <tr key={it.id} className="border-t">
                                                <td className="px-2 py-1">{it.sku_code}</td>
                                                <td className="px-2 py-1">{it.product_name}</td>
                                                <td className="px-2 py-1 text-right tabular-nums font-medium">{rupiah(it.pricelist)}</td>
                                                <td className="px-2 py-1 text-center"><Badge s={it.status} /></td>
                                                <td className="px-2 py-1 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button onClick={() => setView(it)} title="Lihat detail" className="rounded p-0.5 text-slate-600 hover:bg-muted dark:text-slate-300"><Eye className="h-4 w-4" /></button>
                                                        {it.status === 'pending' && (
                                                            <>
                                                                <button onClick={() => decideItem(it, 'approved')} title="Setujui item" className="rounded p-0.5 text-emerald-600 hover:bg-emerald-50"><Check className="h-4 w-4" /></button>
                                                                <button onClick={() => decideItem(it, 'rejected')} title="Tolak item" className="rounded p-0.5 text-red-600 hover:bg-red-50"><X className="h-4 w-4" /></button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {(s.status === 'pending' || s.status === 'partial') && (
                                <div className="flex flex-wrap justify-end gap-2">
                                    <Button size="sm" variant="outline" className="w-full text-red-600 sm:w-auto" onClick={() => reject(s)}><X className="mr-1 h-4 w-4" /> Tolak semua</Button>
                                    <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto" onClick={() => approve(s)}><Check className="mr-1 h-4 w-4" /> Setujui semua</Button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                <p className="text-xs text-muted-foreground">Persetujuan oleh Direktur Utama (atau Head Finance sebagai override). <Link href={route('pricelist.index')} className="underline">Lihat Pricelist →</Link></p>
            </div>

            <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
                <DialogContent className="w-[95vw] max-w-2xl">
                    <DialogHeader><DialogTitle>Detail — {view?.sku_code}</DialogTitle></DialogHeader>
                    {view?.detail && (() => {
                        const d = view.detail!;
                        const bd = d.breakdown ?? {};
                        const ch = d.changes ?? {};
                        const plChange: [number, number] | null = d.pricelist_before != null && d.pricelist_before !== view.pricelist ? [d.pricelist_before, view.pricelist] : null;
                        return (
                            <div className="max-h-[70vh] space-y-3 overflow-auto pr-1 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">{view.product_name}</span>
                                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">Baris kuning = berubah</span>
                                </div>
                                <Sect title="Identitas">
                                    <ARow label="Principal" value={d.brand || '—'} />
                                    <ARow label="Kategori" value={d.category.join(' › ') || '—'} />
                                    <ARow label="Type" value={d.product_type || '—'} />
                                    <ARow label="Qty Beli / Jual" value={`${d.qty_beli} ${d.uom_beli ?? ''} / ${d.qty_jual} ${d.uom_jual ?? ''}`} />
                                </Sect>
                                <Sect title="Harga Principal">
                                    <ARow label="Price Principle" value={`${d.price_principle.toLocaleString('id-ID')} ${d.currency_code ?? ''}`} />
                                    <ARow label="Disc Principle" value={pct(d.disc_principle_pct)} />
                                    <ARow label="Kurs" value={d.kurs.toLocaleString('id-ID')} />
                                    <ARow label="A · Pricelist Principal IDR" value={rupiah(bd.a_principal_idr ?? 0)} />
                                </Sect>
                                <Sect title="Biaya">
                                    <ARow label={`Biaya Masuk (${pct(d.bm_pct)})`} value={rupiah(bd.bm ?? 0)} />
                                    <ARow label={`PPh 22 (${pct(d.pph22_pct)})`} value={rupiah(bd.pph22 ?? 0)} />
                                    <ARow label={`PPN (${pct(d.ppn_pct)})`} value={rupiah(bd.ppn ?? 0)} />
                                    <ARow label={`Shipment (${pct(d.shipment_pct)})`} value={rupiah(bd.shipment ?? 0)} />
                                    <ARow label="B · Total Cost" value={rupiah(bd.b_total_cost ?? 0)} />
                                </Sect>
                                <Sect title="Gudang & Profit">
                                    <ARow label="C · Harga Masuk Gudang" value={rupiah(bd.c_warehouse ?? 0)} />
                                    <ARow label="Alokasi % Operasional (D)" value={pct(d.ops_pct)} change={ch.ops_pct} unit="pct" />
                                    <ARow label="E · Harga Gudang" value={rupiah(bd.e_harga_gudang ?? 0)} />
                                    <ARow label="Alokasi % Profit (F)" value={pct(d.profit_pct)} change={ch.profit_pct} unit="pct" />
                                    <ARow label="G · Harga Bawah" value={rupiah(bd.g_bottom ?? 0)} />
                                </Sect>
                                <Sect title="Alokasi Diskon & Pricelist">
                                    <ARow label="Komisi (H)" value={pct(d.komisi_pct)} change={ch.komisi_pct} unit="pct" />
                                    <ARow label="Event (I)" value={pct(d.event_pct)} change={ch.event_pct} unit="pct" />
                                    <ARow label="Lainnya (J)" value={pct(d.lainnya_pct)} change={ch.lainnya_pct} unit="pct" />
                                    <ARow label="Maks Discount (M)" value={pct(d.buffer_pct)} change={ch.buffer_pct} unit="pct" />
                                    <ARow label="L · Harga Pricelist" value={rupiah(view.pricelist)} change={plChange} unit="rp" big />
                                </Sect>
                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}

const pct = (v: number | string) => `${(+v || 0).toLocaleString('id-ID')}%`;
function Sect({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
            <div className="rounded-md border px-3 py-1">{children}</div>
        </div>
    );
}
function ARow({ label, value, change, unit, big }: { label: string; value: React.ReactNode; change?: [number, number] | null; unit?: 'pct' | 'rp'; big?: boolean }) {
    const fmt = (n: number) => (unit === 'rp' ? rupiah(n) : `${(+n).toLocaleString('id-ID')}%`);
    const hl = !!change;
    return (
        <div className={`flex items-center justify-between gap-4 border-b py-1.5 last:border-0 ${hl ? '-mx-3 bg-amber-50 px-3 dark:bg-amber-950/30' : ''}`}>
            <span className="break-words text-muted-foreground">{label}</span>
            <span className={`shrink-0 text-right tabular-nums ${big ? 'text-base font-bold' : ''}`}>
                {hl ? <span className="font-semibold text-amber-700 dark:text-amber-400">{fmt(change![0])} → {fmt(change![1])}</span> : value}
            </span>
        </div>
    );
}
