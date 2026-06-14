import { Can } from '@/components/can';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm } from '@inertiajs/react';
import { type FormEventHandler } from 'react';

interface Props {
    overtime: { rate_per_hour: number; multiplier_workday: number; multiplier_holiday: number };
}

export default function OvertimeSection({ overtime }: Props) {
    const { data, setData, put, processing, errors, recentlySuccessful } = useForm({
        rate_per_hour: String(overtime.rate_per_hour),
        multiplier_workday: String(overtime.multiplier_workday),
        multiplier_holiday: String(overtime.multiplier_holiday),
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        put(route('overtime.settings.update'), { preserveScroll: true });
    };

    const preview = (m: string) => 'Rp ' + (Number(data.rate_per_hour || 0) * Number(m || 0)).toLocaleString('id-ID') + '/jam';

    return (
        <Card>
            <CardContent className="py-5">
                <div className="mb-4">
                    <h2 className="text-base font-semibold">Lembur</h2>
                    <p className="text-sm text-muted-foreground">Tarif global per jam & pengali. Tidak mempengaruhi periode lembur yang sudah disetujui (tarifnya sudah dikunci).</p>
                </div>
                <form onSubmit={submit} className="grid max-w-md gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="rate">Tarif per Jam (Rp)</Label>
                        <Input id="rate" type="number" min="0" step="any" value={data.rate_per_hour} onChange={(e) => setData('rate_per_hour', e.target.value)} required />
                        <InputError message={errors.rate_per_hour} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="mw">Pengali Hari Kerja</Label>
                            <Input id="mw" type="number" min="0" step="0.1" value={data.multiplier_workday} onChange={(e) => setData('multiplier_workday', e.target.value)} required />
                            <p className="text-xs text-muted-foreground">{preview(data.multiplier_workday)}</p>
                            <InputError message={errors.multiplier_workday} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="mh">Pengali Hari Libur</Label>
                            <Input id="mh" type="number" min="0" step="0.1" value={data.multiplier_holiday} onChange={(e) => setData('multiplier_holiday', e.target.value)} required />
                            <p className="text-xs text-muted-foreground">{preview(data.multiplier_holiday)}</p>
                            <InputError message={errors.multiplier_holiday} />
                        </div>
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
