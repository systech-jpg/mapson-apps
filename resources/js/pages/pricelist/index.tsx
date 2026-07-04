import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, FileSpreadsheet, History, Paperclip, Search } from 'lucide-react';
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
interface Detail {
    brand: string | null; category: string[]; product_type: string | null; currency_code: string | null;
    price_principle: number; disc_principle_pct: number; kurs: number;
    qty_beli: number; uom_beli: string | null; qty_jual: number; uom_jual: string | null;
    bm_pct: number; pph22_pct: number; ppn_pct: number; shipment_pct: number;
    ops_pct: number; profit_pct: number; komisi_pct: number; event_pct: number; lainnya_pct: number; buffer_pct: number;
    breakdown: Record<string, number> | null;
}
interface Row {
    id: number; sku_code: string | null; product_name: string | null; principal: string | null; profile: string | null; hospital: string | null;
    pricelist: number; harga_beli: number; effective_from: string | null; effective_to: string | null; approved_at: string | null; approved_by: string | null;
    detail: Detail; history: Version[];
}
interface Paginated<T> { data: T[]; links: { url: string | null; label: string; active: boolean }[] }
interface Props { rows: Paginated<Row>; filters: { q: string; principal: string; hospital: string }; principals: { id: number; name: string }[]; hospitals: { id: number; name: string }[] }

const rupiah = (v: number) => 'Rp ' + Math.round(v).toLocaleString('id-ID');

export default function PricelistIndex({ rows, filters, principals, hospitals }: Props) {
    const [q, setQ] = useState(filters.q);
    const [detail, setDetail] = useState<Row | null>(null);   // history dialog
    const [preview, setPreview] = useState<Row | null>(null); // full-breakdown dialog
    const [showBeli, setShowBeli] = useState(false);
    const [exportFull, setExportFull] = useState(false);
    const apply = (extra: Record<string, string>) => router.get(route('pricelist.index'), { q, principal: filters.principal, hospital: filters.hospital, ...extra }, { preserveState: true, replace: true });
    const doExport = () => { window.location.href = route('pricelist.export', { q: filters.q, principal: filters.principal, hospital: filters.hospital, full: exportFull ? 1 : 0 }); };
    const colCount = 8 + (showBeli ? 1 : 0);

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
                    <select value={filters.hospital} onChange={(e) => apply({ hospital: e.target.value })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="">Semua RS</option>
                        <option value="base">Base (semua RS)</option>
                        {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                    <Button variant="outline" size="sm" onClick={() => setShowBeli((v) => !v)}>
                        {showBeli ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />} Harga Beli
                    </Button>
                    <div className="ml-auto flex items-center gap-2">
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <input type="checkbox" checked={exportFull} onChange={(e) => setExportFull(e.target.checked)} /> Struktur lengkap
                        </label>
                        <Button variant="outline" size="sm" onClick={doExport}><FileSpreadsheet className="mr-1 h-4 w-4" /> Export Excel</Button>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">Menampilkan harga yang berlaku (aktif). Centang <b>Struktur lengkap</b> untuk export bergaya Pricing Engine; jika tidak, export hanya Harga Beli & Harga Jual.</p>

                <div className="overflow-x-auto rounded-lg border">
                    <table className="min-w-full text-sm">
                        <thead className="bg-muted/60"><tr>
                            <th className="px-2 py-1.5 text-left">Principal</th><th className="px-2 py-1.5 text-left">Kode</th><th className="px-2 py-1.5 text-left">Deskripsi</th>
                            <th className="px-2 py-1.5 text-left">Profil</th><th className="px-2 py-1.5 text-left">RS</th>{showBeli && <th className="px-2 py-1.5 text-right">Harga Beli</th>}<th className="px-2 py-1.5 text-right">Harga Pricelist</th>
                            <th className="px-2 py-1.5 text-left">Disetujui</th><th className="px-2 py-1.5" />
                        </tr></thead>
                        <tbody>
                            {rows.data.map((r) => (
                                <tr key={r.id} className="border-t hover:bg-muted/30">
                                    <td className="px-2 py-1.5">{r.principal}</td>
                                    <td className="px-2 py-1.5">{r.sku_code}</td>
                                    <td className="px-2 py-1.5">{r.product_name}</td>
                                    <td className="px-2 py-1.5">{r.profile}</td>
                                    <td className="px-2 py-1.5">{r.hospital ? <span className="text-sky-700 dark:text-sky-300">{r.hospital}</span> : <span className="text-muted-foreground">Semua RS</span>}</td>
                                    {showBeli && <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{rupiah(r.harga_beli)}</td>}
                                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{rupiah(r.pricelist)}</td>
                                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{r.approved_at}<br />{r.approved_by}</td>
                                    <td className="px-2 py-1.5 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button onClick={() => setPreview(r)} title="Lihat detail" className="text-slate-600 hover:text-slate-900 dark:text-slate-300"><Eye className="h-4 w-4" /></button>
                                            <button onClick={() => setDetail(r)} title="Riwayat versi" className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800">
                                                <History className="h-4 w-4" />{r.history.length > 1 && <span className="text-[10px]">{r.history.length}</span>}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {rows.data.length === 0 && <tr><td colSpan={colCount} className="p-6 text-center text-muted-foreground">Belum ada harga disetujui.</td></tr>}
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

            <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader><DialogTitle>Detail Harga — {preview?.sku_code}</DialogTitle></DialogHeader>
                    {preview && (() => {
                        const d = preview.detail;
                        const bd = d.breakdown ?? {};
                        return (
                            <div className="max-h-[70vh] space-y-3 overflow-auto pr-1 text-sm">
                                <div className="text-muted-foreground">{preview.product_name}</div>
                                <Sect title="Identitas & Masa Berlaku">
                                    <PRow label="Principal" value={preview.principal ?? '—'} />
                                    <PRow label="Profil" value={preview.profile ?? '—'} />
                                    <PRow label="Rumah Sakit" value={preview.hospital ?? 'Semua RS (base)'} />
                                    <PRow label="Kategori" value={d.category.join(' › ') || '—'} />
                                    <PRow label="Type" value={d.product_type || '—'} />
                                    <PRow label="Berlaku" value={`${preview.effective_from} s/d ${preview.effective_to ?? 'sekarang'}`} />
                                    <PRow label="Disetujui" value={`${preview.approved_at ?? '—'} · ${preview.approved_by ?? '—'}`} />
                                </Sect>
                                <Sect title="Harga Principal">
                                    <PRow label="Price Principle" value={`${d.price_principle.toLocaleString('id-ID')} ${d.currency_code ?? ''}`} />
                                    <PRow label="Disc Principle" value={pct(d.disc_principle_pct)} />
                                    <PRow label="Kurs" value={d.kurs.toLocaleString('id-ID')} />
                                    <PRow label="A · Pricelist Principal IDR (Harga Beli)" value={rupiah(bd.a_principal_idr ?? 0)} strong />
                                </Sect>
                                <Sect title="Biaya">
                                    <PRow label={`Biaya Masuk (${pct(d.bm_pct)})`} value={rupiah(bd.bm ?? 0)} />
                                    <PRow label={`PPh 22 (${pct(d.pph22_pct)})`} value={rupiah(bd.pph22 ?? 0)} />
                                    <PRow label={`PPN (${pct(d.ppn_pct)})`} value={rupiah(bd.ppn ?? 0)} />
                                    <PRow label={`Shipment (${pct(d.shipment_pct)})`} value={rupiah(bd.shipment ?? 0)} />
                                    <PRow label="B · Total Cost" value={rupiah(bd.b_total_cost ?? 0)} strong />
                                </Sect>
                                <Sect title="Gudang & Profit">
                                    <PRow label="C · Harga Masuk Gudang" value={rupiah(bd.c_warehouse ?? 0)} />
                                    <PRow label={`Alokasi % Operasional (${pct(d.ops_pct)})`} value={rupiah(bd.e_harga_gudang ?? 0)} />
                                    <PRow label="E · Harga Gudang" value={rupiah(bd.e_harga_gudang ?? 0)} strong />
                                    <PRow label={`Alokasi % Profit (${pct(d.profit_pct)})`} value={rupiah(bd.g_bottom ?? 0)} />
                                    <PRow label="G · Harga Bawah" value={rupiah(bd.g_bottom ?? 0)} strong />
                                </Sect>
                                <Sect title="Alokasi Diskon & Pricelist">
                                    <PRow label="Komisi (H)" value={pct(d.komisi_pct)} />
                                    <PRow label="Event (I)" value={pct(d.event_pct)} />
                                    <PRow label="Lainnya (J)" value={pct(d.lainnya_pct)} />
                                    <PRow label="Maks Discount (M)" value={pct(d.buffer_pct)} />
                                    <PRow label="Harga Jual (Pricelist)" value={rupiah(preview.pricelist)} big />
                                </Sect>
                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>

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

const pct = (v: number) => `${(+v || 0).toLocaleString('id-ID')}%`;
function Sect({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
            <div className="rounded-md border px-3 py-1">{children}</div>
        </div>
    );
}
function PRow({ label, value, strong, big }: { label: string; value: React.ReactNode; strong?: boolean; big?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-4 border-b py-1.5 last:border-0">
            <span className="text-muted-foreground">{label}</span>
            <span className={`text-right tabular-nums ${big ? 'text-base font-bold text-emerald-700 dark:text-emerald-400' : strong ? 'font-semibold' : ''}`}>{value}</span>
        </div>
    );
}
