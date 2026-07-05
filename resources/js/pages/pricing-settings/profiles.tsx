import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Plus, Save } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Finance', href: '#' },
    { title: 'Kelola Profil', href: '/finance/pricing-profiles' },
];

interface Profile {
    id?: number | null; code: string; name: string; rounding_step: number | string; is_active: boolean;
    default_bm_pct: number | string; default_pph22_pct: number | string; default_ppn_pct: number | string; default_shipment_pct: number | string;
    default_ops_pct: number | string; default_profit_pct: number | string; default_komisi_pct: number | string;
    default_event_pct: number | string; default_lainnya_pct: number | string; default_buffer_pct: number | string;
}
interface Props { profiles: Profile[] }

// [field, header] for the % columns.
const PCT: [keyof Profile, string][] = [
    ['default_bm_pct', 'BM%'], ['default_pph22_pct', 'PPh22%'], ['default_ppn_pct', 'PPN%'], ['default_shipment_pct', 'Ship%'],
    ['default_ops_pct', 'Ops%'], ['default_profit_pct', 'Profit%'], ['default_komisi_pct', 'Komisi%'],
    ['default_event_pct', 'Event%'], ['default_lainnya_pct', 'Lainnya%'], ['default_buffer_pct', 'MaksDisc%'],
];

const blank = (): Profile => ({
    code: '', name: '', rounding_step: 1000, is_active: true,
    default_bm_pct: 0, default_pph22_pct: 0, default_ppn_pct: 0, default_shipment_pct: 0,
    default_ops_pct: 0, default_profit_pct: 0, default_komisi_pct: 0, default_event_pct: 0, default_lainnya_pct: 0, default_buffer_pct: 0,
});

// Values arrive as decimal:3 strings ("5.000"); show at most 2 decimals, no trailing zeros.
const num2 = (v: number | string) => Math.round((parseFloat(String(v ?? 0)) || 0) * 100) / 100;
const normalize = (p: Profile): Profile => {
    const o = { ...p };
    PCT.forEach(([k]) => { (o as Record<string, unknown>)[k] = num2(p[k] as number | string); });
    return o;
};

export default function ProfilesSettings({ profiles }: Props) {
    const [rows, setRows] = useState<Profile[]>(profiles.map(normalize));
    const [saving, setSaving] = useState(false);

    const set = (i: number, key: keyof Profile, value: string | number | boolean) =>
        setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
    const addRow = () => setRows((rs) => [...rs, blank()]);
    const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));
    const save = () => router.post(route('pricing-profiles.save'), { profiles: rows } as never, {
        preserveScroll: true, onStart: () => setSaving(true), onFinish: () => setSaving(false),
    });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Kelola Profil" />
            <div className="flex flex-col gap-4 p-4">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={addRow}><Plus className="mr-1 h-4 w-4" /> Tambah Profil</Button>
                    <span className="text-xs text-muted-foreground">Nilai default ini jadi acuan saat mengisi harga baru di Pricing Engine.</span>
                    <div className="ml-auto" />
                    <Button size="sm" onClick={save} disabled={saving}><Save className="mr-1 h-4 w-4" /> Simpan</Button>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                    <table className="min-w-max text-sm">
                        <thead className="bg-muted/60"><tr>
                            <th className="px-2 py-1.5 text-left">Code</th><th className="px-2 py-1.5 text-left">Nama</th><th className="px-2 py-1.5 text-right">Rounding</th>
                            {PCT.map(([, h]) => <th key={h} className="px-2 py-1.5 text-right">{h}</th>)}
                            <th className="px-2 py-1.5 text-center">Aktif</th><th className="px-2 py-1.5" />
                        </tr></thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i} className="border-t">
                                    <td className="px-2 py-1"><input value={r.code} onChange={(e) => set(i, 'code', e.target.value)} className="h-7 w-28 rounded border bg-background px-1 text-xs" /></td>
                                    <td className="px-2 py-1"><input value={r.name} onChange={(e) => set(i, 'name', e.target.value)} className="h-7 w-48 rounded border bg-background px-1 text-xs" /></td>
                                    <td className="px-2 py-1"><NInput value={r.rounding_step} onChange={(v) => set(i, 'rounding_step', v)} w="w-16" /></td>
                                    {PCT.map(([k]) => <td key={k} className="px-2 py-1"><NInput value={rows[i][k] as number} onChange={(v) => set(i, k, v)} /></td>)}
                                    <td className="px-2 py-1 text-center"><input type="checkbox" checked={!!r.is_active} onChange={(e) => set(i, 'is_active', e.target.checked)} /></td>
                                    <td className="px-2 py-1 text-right"><button onClick={() => removeRow(i)} title="Hapus" className="text-red-500 hover:underline">×</button></td>
                                </tr>
                            ))}
                            {rows.length === 0 && <tr><td colSpan={PCT.length + 5} className="p-6 text-center text-muted-foreground">Belum ada profil.</td></tr>}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-muted-foreground">Menghapus baris lalu Simpan tidak menghapus profil dari database (hanya profil yang tidak dikirim tetap ada). Untuk menonaktifkan, hilangkan centang <b>Aktif</b>.</p>
            </div>
        </AppLayout>
    );
}

// Module-level so it keeps a stable identity across renders (an inline component would remount
// on every keystroke and lose focus).
function NInput({ value, onChange, w = 'w-12' }: { value: number | string; onChange: (v: string) => void; w?: string }) {
    return (
        <input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)}
            className={`h-7 ${w} rounded border bg-background px-1 text-right text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`} />
    );
}
