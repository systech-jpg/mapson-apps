import { Can } from '@/components/can';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm } from '@inertiajs/react';
import { type FormEventHandler } from 'react';

interface Props {
    overtime: { rate_per_hour: number; multiplier_workday: number; holiday_flat_rate: number };
}

export default function OvertimeSection({ overtime }: Props) {
    const { data, setData, put, processing, errors, recentlySuccessful } = useForm({
        rate_per_hour: String(overtime.rate_per_hour),
        multiplier_workday: String(overtime.multiplier_workday),
        holiday_flat_rate: String(overtime.holiday_flat_rate),
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        put(route('overtime.settings.update'), { preserveScroll: true });
    };

    const rupiah = (v: string) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');

    return (
        <Card>
            <CardContent className="py-5">
                <div className="mb-4">
                    <h2 className="text-base font-semibold">Lembur</h2>
                    <p className="text-sm text-muted-foreground">
                        Hari kerja: per jam (tarif × pengali). Hari libur/akhir pekan: <b>tarif tetap per hari</b>, berapa pun jamnya.
                        Tidak mempengaruhi periode yang sudah disetujui (tarifnya sudah dikunci).
                    </p>
                </div>
                <form onSubmit={submit} className="grid max-w-md gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="rate">Tarif per Jam — Hari Kerja (Rp)</Label>
                            <Input id="rate" type="number" min="0" step="any" value={data.rate_per_hour} onChange={(e) => setData('rate_per_hour', e.target.value)} required />
                            <InputError message={errors.rate_per_hour} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="mw">Pengali Hari Kerja</Label>
                            <Input id="mw" type="number" min="0" step="0.1" value={data.multiplier_workday} onChange={(e) => setData('multiplier_workday', e.target.value)} required />
                            <p className="text-xs text-muted-foreground">{rupiah(String(Number(data.rate_per_hour || 0) * Number(data.multiplier_workday || 0)))}/jam</p>
                            <InputError message={errors.multiplier_workday} />
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="flat">Tarif Tetap Hari Libur / Akhir Pekan (Rp per hari)</Label>
                        <Input id="flat" type="number" min="0" step="any" value={data.holiday_flat_rate} onChange={(e) => setData('holiday_flat_rate', e.target.value)} required />
                        <p className="text-xs text-muted-foreground">{rupiah(data.holiday_flat_rate)}/hari — berapa pun jumlah jam lembur di hari itu.</p>
                        <InputError message={errors.holiday_flat_rate} />
                    </div>
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
