import { Can } from '@/components/can';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { ArrowLeft, Link2, Link2Off, Pencil, Replace, Search } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';
import { emptyRegForm, RegHeaderFields, type RegForm, type Registration, regStatus, regToForm, STATUS_BADGE, tglID } from './products';

interface ErpProduct {
    id: number;
    ref: string;
    label: string | null;
    principal: string | null;
    barcode: string | null;
    reff: string | null;
    jenis_stock: string | null;
    expire_date: string | null;
    tosell: boolean;
    noakl: string | null;
    akl_description: string | null;
    desc_match: 'same' | 'diff' | 'missing';
}

interface Props {
    registration: Registration;
    products: ErpProduct[];
    aklOnly: { item_code: string; description: string | null; erp: { id: number; noakl: string | null } | null }[];
    erpError: string | null;
    expiringDays: number;
}

const MATCH_BADGE: Record<ErpProduct['desc_match'], { label: string; cls: string }> = {
    same: { label: 'Sama', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
    diff: { label: 'Beda', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
    missing: { label: 'Tidak di lampiran', cls: 'bg-muted text-muted-foreground' },
};

export default function RegulatoryProductDetail({ registration: r, products, aklOnly, erpError, expiringDays }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Regulatory', href: '#' },
        { title: 'Registrasi Produk', href: '/regulatory/products' },
        { title: r.akl_number, href: `/regulatory/products/${r.id}` },
    ];

    const st = STATUS_BADGE[regStatus(r, expiringDays)];
    const [open, setOpen] = useState(false);
    const [filterQ, setFilterQ] = useState('');
    const [diffOnly, setDiffOnly] = useState(false);
    // Pencarian produk ERP untuk ditautkan.
    const [prodQ, setProdQ] = useState('');
    const [prodRows, setProdRows] = useState<ErpProduct[]>([]);
    const [prodLoading, setProdLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const { data, setData, put, processing, errors, clearErrors } = useForm<RegForm>(emptyRegForm());

    const openEdit = () => {
        clearErrors();
        setData(regToForm(r));
        setOpen(true);
    };

    const submit: FormEventHandler = (ev) => {
        ev.preventDefault();
        put(route('regulatory-products.update', r.id), { preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    const searchProducts = async () => {
        if (prodQ.trim().length < 2) return;
        setProdLoading(true);
        try {
            const res = await fetch(`${route('regulatory-products.product-search')}?q=${encodeURIComponent(prodQ)}`, { headers: { Accept: 'application/json' } });
            const json = (await res.json()) as { rows?: ErpProduct[] };
            setProdRows(json.rows ?? []);
            setSearched(true);
        } catch {
            setProdRows([]);
        } finally {
            setProdLoading(false);
        }
    };

    const attach = (p: ErpProduct) => {
        if (p.noakl && !confirm(`Produk ${p.ref} sudah ter-tag ke "${p.noakl}". Pindahkan ke izin ini?`)) return;
        router.post(route('regulatory-products.attach', r.id), { product_id: p.id }, {
            preserveScroll: true,
            onSuccess: () => setProdRows((rows) => rows.filter((x) => x.id !== p.id)),
        });
    };

    const detach = (p: ErpProduct) => {
        if (!confirm(`Lepas produk ${p.ref} dari izin ini? (No. AKL di produk ERP dikosongkan)`)) return;
        router.post(route('regulatory-products.detach', r.id), { product_id: p.id }, { preserveScroll: true });
    };

    // Samakan deskripsi ERP ← lampiran AKL (tulis label produk di ERP).
    const replaceOne = (p: ErpProduct) => {
        if (!confirm(`Ganti deskripsi ERP produk ${p.ref}?\n\nERP : ${p.label ?? '—'}\nAKL : ${p.akl_description ?? '—'}`)) return;
        router.post(route('regulatory-products.replace-label', r.id), { product_id: p.id }, { preserveScroll: true });
    };

    const diffCount = products.filter((p) => p.desc_match === 'diff').length;
    const replaceAll = () => {
        if (!confirm(`Samakan ${diffCount} deskripsi produk ERP dengan deskripsi lampiran AKL?`)) return;
        router.post(route('regulatory-products.replace-label', r.id), { all: true }, { preserveScroll: true });
    };

    const fq = filterQ.trim().toLowerCase();
    const shown = products
        .filter((p) => !diffOnly || p.desc_match === 'diff')
        .filter((p) => fq === '' || [p.ref, p.label, p.akl_description, p.principal, p.reff, p.barcode].some((v) => (v ?? '').toLowerCase().includes(fq)));

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${r.akl_number} — Registrasi Produk`} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <Button variant="outline" size="icon" className="mt-0.5" onClick={() => router.visit(route('regulatory-products.index'))}>
                            <ArrowLeft className="size-4" />
                        </Button>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="font-mono text-xl font-semibold">{r.akl_number}</h1>
                                <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', st.cls)}>{st.label}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">{r.product_name}</p>
                        </div>
                    </div>
                    <Can on="regulatory-products" do="edit">
                        <Button variant="outline" onClick={openEdit}>
                            <Pencil className="size-4" /> Ubah Data Izin
                        </Button>
                    </Can>
                </div>

                {erpError && (
                    <Card>
                        <CardContent className="py-3 text-sm text-rose-600 dark:text-rose-400">{erpError}</CardContent>
                    </Card>
                )}

                <Card>
                    <CardContent className="grid gap-x-8 gap-y-2 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                            <div className="text-xs text-muted-foreground">Produsen / Principle</div>
                            <div>{r.manufacturer ?? '—'}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">License Holder (Pemegang Izin)</div>
                            <div className="font-medium">{r.license_holder ?? '—'}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Kelas Resiko</div>
                            <div>{r.risk_class ?? '—'}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Tgl Terbit</div>
                            <div>{tglID(r.issued_date)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Tgl Expired</div>
                            <div className="font-medium">{tglID(r.expired_date)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Kategori Produk</div>
                            <div>{r.category ?? '—'}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Sub Kategori</div>
                            <div>{r.sub_category ?? '—'}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Jenis Produk</div>
                            <div>{r.product_type ?? '—'}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Jenis Permohonan</div>
                            <div>{r.application_type ?? '—'}</div>
                        </div>
                        {r.notes && (
                            <div className="sm:col-span-2 lg:col-span-4">
                                <div className="text-xs text-muted-foreground">Catatan</div>
                                <div>{r.notes}</div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-semibold">
                        Produk Diregistrasikan <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{products.length}</span>
                        {diffCount > 0 && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                {diffCount} deskripsi beda
                            </span>
                        )}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
                            <input type="checkbox" className="size-3.5 accent-amber-600" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} />
                            hanya yang beda
                        </label>
                        <div className="relative">
                            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="Saring daftar…" className="h-9 w-56 pl-8" />
                        </div>
                        {diffCount > 0 && (
                            <Can on="regulatory-products" do="edit">
                                <Button variant="outline" onClick={replaceAll}>
                                    <Replace className="size-4" /> Samakan Semua ({diffCount})
                                </Button>
                            </Can>
                        )}
                    </div>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs text-muted-foreground [&>th]:h-9 [&>th]:px-3 [&>th]:font-medium">
                                        <th className="w-10">#</th>
                                        <th>Kode (ERP)</th>
                                        <th>Deskripsi ERP</th>
                                        <th>Deskripsi AKL (lampiran)</th>
                                        <th>Cek</th>
                                        <th>Principal</th>
                                        <th>Reff / Barcode</th>
                                        <th>Jenis Stock</th>
                                        <th>Dijual</th>
                                        <th className="w-20 !text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shown.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} className="py-10 text-center text-muted-foreground">
                                                {products.length === 0 ? 'Belum ada produk ERP yang ter-tag ke izin ini — tautkan lewat pencarian di bawah.' : 'Tidak ada yang cocok dengan saringan.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        shown.map((p, i) => {
                                            const mb = MATCH_BADGE[p.desc_match];
                                            return (
                                                <tr key={p.id} className={cn('border-b [&>td]:px-3 [&>td]:py-2', p.desc_match === 'diff' && 'bg-amber-50/60 dark:bg-amber-950/20')}>
                                                    <td className="text-muted-foreground">{i + 1}</td>
                                                    <td className="font-mono text-xs whitespace-nowrap">{p.ref}</td>
                                                    <td className="max-w-72 truncate" title={p.label ?? ''}>{p.label ?? '—'}</td>
                                                    <td className="max-w-72 truncate" title={p.akl_description ?? ''}>{p.akl_description ?? '—'}</td>
                                                    <td>
                                                        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', mb.cls)}>{mb.label}</span>
                                                    </td>
                                                    <td className="max-w-40 truncate">{p.principal ?? '—'}</td>
                                                    <td className="max-w-40 truncate font-mono text-xs">{p.reff ?? p.barcode ?? '—'}</td>
                                                    <td className="text-xs">{p.jenis_stock ?? '—'}</td>
                                                    <td className="text-xs">{p.tosell ? 'Ya' : 'Tidak'}</td>
                                                    <td className="text-right">
                                                        <div className="flex items-center justify-end gap-0.5">
                                                            {p.desc_match === 'diff' && (
                                                                <Can on="regulatory-products" do="edit">
                                                                    <Button variant="ghost" size="icon" className="size-7 text-amber-600 dark:text-amber-400" title="Ganti deskripsi ERP dengan deskripsi AKL" onClick={() => replaceOne(p)}>
                                                                        <Replace className="size-4" />
                                                                    </Button>
                                                                </Can>
                                                            )}
                                                            <Can on="regulatory-products" do="edit">
                                                                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" title="Lepas dari izin ini" onClick={() => detach(p)}>
                                                                    <Link2Off className="size-4" />
                                                                </Button>
                                                            </Can>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {aklOnly.length > 0 && (
                    <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
                        <CardContent className="py-4">
                            <div className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                                {aklOnly.length} kode di lampiran AKL belum ter-tag di ERP
                                <span className="ml-2 font-normal text-amber-700/80 dark:text-amber-400/80">
                                    ({aklOnly.filter((x) => x.erp).length} ada di ERP · {aklOnly.filter((x) => !x.erp).length} tidak ada di master produk ERP)
                                </span>
                            </div>
                            <div className="max-h-56 overflow-auto">
                                <table className="w-full text-xs">
                                    <thead className="text-amber-700/80 dark:text-amber-400/80">
                                        <tr className="[&>th]:py-1 [&>th]:pr-4 [&>th]:text-left [&>th]:font-medium">
                                            <th className="w-44">Kode (lampiran)</th>
                                            <th>Deskripsi (lampiran)</th>
                                            <th className="w-56">Status di ERP</th>
                                            <th className="w-16" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {aklOnly.map((it, i) => (
                                            <tr key={i} className="border-t border-amber-200/60 dark:border-amber-900/60 [&>td]:py-1 [&>td]:pr-4">
                                                <td className="font-mono">{it.item_code}</td>
                                                <td>{it.description ?? '—'}</td>
                                                <td>
                                                    {it.erp ? (
                                                        it.erp.noakl ? (
                                                            <span>
                                                                ada di ERP, ter-tag ke <span className="font-mono">{it.erp.noakl}</span>
                                                            </span>
                                                        ) : (
                                                            <span>ada di ERP, belum ter-tag</span>
                                                        )
                                                    ) : (
                                                        <span className="font-medium text-rose-600 dark:text-rose-400">tidak ada di master produk ERP</span>
                                                    )}
                                                </td>
                                                <td className="text-right">
                                                    {it.erp && (
                                                        <Can on="regulatory-products" do="edit">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-6 px-2 text-[11px]"
                                                                onClick={() => attach({ id: it.erp!.id, ref: it.item_code, noakl: it.erp!.noakl } as ErpProduct)}
                                                            >
                                                                <Link2 className="size-3" /> Tag
                                                            </Button>
                                                        </Can>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                                Kode berstatus "tidak ada di master produk ERP" harus dibuat dulu produknya di ERP, baru bisa di-tag.
                                Kode yang ada di ERP bisa langsung di-Tag dari sini.
                            </p>
                        </CardContent>
                    </Card>
                )}

                <Can on="regulatory-products" do="edit">
                    <Card>
                        <CardContent className="py-4">
                            <div className="mb-2 text-sm font-medium">Tautkan Produk ERP ke Izin Ini</div>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    void searchProducts();
                                }}
                                className="flex flex-wrap items-center gap-2"
                            >
                                <Input className="h-9 w-72" placeholder="Cari produk ERP (kode / nama)…" value={prodQ} onChange={(e) => setProdQ(e.target.value)} />
                                <Button type="submit" variant="outline" disabled={prodLoading || prodQ.trim().length < 2}>
                                    <Search className="size-4" /> Cari
                                </Button>
                                <span className="text-xs text-muted-foreground">No. AKL akan ditulis langsung ke produk di ERP.</span>
                            </form>
                            {searched && prodRows.length === 0 && !prodLoading && (
                                <p className="mt-3 text-xs text-muted-foreground">Tidak ada produk ERP yang cocok.</p>
                            )}
                            {prodRows.length > 0 && (
                                <div className="mt-3 max-h-72 overflow-auto rounded-md border">
                                    <table className="w-full text-xs">
                                        <thead className="sticky top-0 bg-muted text-muted-foreground">
                                            <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                                                <th className="w-44">Kode</th>
                                                <th>Deskripsi</th>
                                                <th className="w-44">No. AKL Saat Ini</th>
                                                <th className="w-20 !text-right" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {prodRows.map((p) => (
                                                <tr key={p.id} className="border-t [&>td]:px-2 [&>td]:py-1">
                                                    <td className="font-mono">{p.ref}</td>
                                                    <td>{p.label ?? '—'}</td>
                                                    <td>{p.noakl ? <span className="text-amber-600 dark:text-amber-400">{p.noakl}</span> : <span className="text-muted-foreground">belum ter-tag</span>}</td>
                                                    <td className="text-right">
                                                        <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => attach(p)}>
                                                            <Link2 className="size-3" /> Tag
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </Can>

                <p className="text-xs text-muted-foreground">
                    Daftar produk dibaca langsung dari ERP (field No. AKL pada produk) — konsisten dengan yang tampil di ERP. Perubahan data produk
                    (nama, barcode, jenis stock) dilakukan di ERP.
                </p>
            </div>

            {/* Dialog ubah header izin */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[95vh] w-[97vw] !max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Ubah Izin {r.akl_number}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <RegHeaderFields data={data} setData={(k, v) => setData(k, v)} errors={errors} />
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Batal
                            </Button>
                            <Button type="submit" disabled={processing}>
                                Simpan
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
