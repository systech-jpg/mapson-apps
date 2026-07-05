import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Plus, Save } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Finance', href: '#' },
    { title: 'Kelola Mata Uang', href: '/finance/currencies' },
];

interface Currency { code: string; name: string | null; rate_to_idr: number | string }
interface Props { currencies: Currency[] }

export default function CurrenciesSettings({ currencies }: Props) {
    const [rows, setRows] = useState<Currency[]>(currencies.map((c) => ({ ...c })));
    const [saving, setSaving] = useState(false);

    const set = (i: number, key: keyof Currency, value: string) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
    const addRow = () => setRows((rs) => [...rs, { code: '', name: '', rate_to_idr: 0 }]);
    const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));
    const save = () => router.post(route('currencies.save'), { currencies: rows } as never, {
        preserveScroll: true, onStart: () => setSaving(true), onFinish: () => setSaving(false),
    });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Kelola Mata Uang" />
            <div className="flex flex-col gap-4 p-4">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={addRow}><Plus className="mr-1 h-4 w-4" /> Tambah Mata Uang</Button>
                    <span className="text-xs text-muted-foreground">Kurs ini dipakai Pricing Engine untuk konversi ke IDR.</span>
                    <div className="ml-auto" />
                    <Button size="sm" onClick={save} disabled={saving}><Save className="mr-1 h-4 w-4" /> Simpan</Button>
                </div>

                <div className="max-w-xl overflow-x-auto rounded-lg border">
                    <table className="min-w-full text-sm">
                        <thead className="bg-muted/60"><tr>
                            <th className="px-2 py-1.5 text-left">Kode</th><th className="px-2 py-1.5 text-left">Nama</th><th className="px-2 py-1.5 text-right">Kurs ke IDR</th><th className="px-2 py-1.5" />
                        </tr></thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i} className="border-t">
                                    <td className="px-2 py-1"><input value={r.code} maxLength={3} onChange={(e) => set(i, 'code', e.target.value.toUpperCase())} className="h-8 w-20 rounded border bg-background px-2 text-sm uppercase" placeholder="USD" /></td>
                                    <td className="px-2 py-1"><input value={r.name ?? ''} onChange={(e) => set(i, 'name', e.target.value)} className="h-8 w-56 rounded border bg-background px-2 text-sm" placeholder="US Dollar" /></td>
                                    <td className="px-2 py-1"><input type="number" step="any" value={r.rate_to_idr} onChange={(e) => set(i, 'rate_to_idr', e.target.value)} className="h-8 w-32 rounded border bg-background px-2 text-right text-sm tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" /></td>
                                    <td className="px-2 py-1 text-right"><button onClick={() => removeRow(i)} title="Hapus dari daftar" className="text-red-500 hover:underline">×</button></td>
                                </tr>
                            ))}
                            {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Belum ada mata uang.</td></tr>}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-muted-foreground">Kode wajib 1–3 huruf (mis. IDR, USD). Menghapus baris hanya menghilangkan dari daftar ini; data lama yang tidak dikirim tetap tersimpan.</p>
            </div>
        </AppLayout>
    );
}
