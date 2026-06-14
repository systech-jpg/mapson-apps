import { Can } from '@/components/can';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm } from '@inertiajs/react';
import { type FormEventHandler } from 'react';

interface Fee { tier: number; label: string; fee: string | number }

export default function AttendFeesSection({ fees }: { fees: Fee[] }) {
    const { data, setData, put, processing, recentlySuccessful } = useForm<{ fees: { tier: number; fee: string }[] }>({
        fees: fees.map((f) => ({ tier: f.tier, fee: String(f.fee) })),
    });

    const setFee = (i: number, val: string) => setData('fees', data.fees.map((f, idx) => (idx === i ? { ...f, fee: val } : f)));

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        put(route('hr-settings.attend-fees'), { preserveScroll: true });
    };

    return (
        <Card>
            <CardContent className="py-5">
                <div className="mb-4">
                    <h2 className="text-base font-semibold">Fee Attend Case</h2>
                    <p className="text-sm text-muted-foreground">Tarif fee per <b>case</b> berdasarkan tier jabatan. Total fee karyawan = jumlah attend case × tarif tier-nya.</p>
                </div>
                <form onSubmit={submit} className="grid max-w-md gap-4">
                    {fees.map((f, i) => (
                        <div key={f.tier} className="grid gap-2">
                            <Label htmlFor={`fee-${f.tier}`}>Tier {f.tier} — {f.label} (Rp/case)</Label>
                            <Input id={`fee-${f.tier}`} type="number" min="0" step="any" value={data.fees[i]?.fee ?? ''} onChange={(e) => setFee(i, e.target.value)} required />
                        </div>
                    ))}
                    <Can on="hr-settings" do="edit">
                        <div className="flex items-center gap-3">
                            <Button type="submit" disabled={processing}>Simpan</Button>
                            {recentlySuccessful && <span className="text-sm text-emerald-600">Tersimpan.</span>}
                        </div>
                    </Can>
                </form>
            </CardContent>
        </Card>
    );
}
