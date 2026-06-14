import { Can } from '@/components/can';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm } from '@inertiajs/react';
import { type FormEventHandler } from 'react';

interface Props {
    attendance: { deadline: string; full_day_after: string };
}

export default function AttendanceSection({ attendance }: Props) {
    const { data, setData, put, processing, errors, recentlySuccessful } = useForm({
        deadline: attendance.deadline,
        full_day_after: attendance.full_day_after,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        put(route('hr-settings.attendance'), { preserveScroll: true });
    };

    return (
        <Card>
            <CardContent className="py-5">
                <div className="mb-4">
                    <h2 className="text-base font-semibold">Absensi</h2>
                    <p className="text-sm text-muted-foreground">Aturan keterlambatan untuk Rekap per Jam. Masuk lebih dari batas = telat (potong cuti ½ hari); lebih dari ambang penuh = potong cuti 1 hari.</p>
                </div>
                <form onSubmit={submit} className="grid max-w-md gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="deadline">Batas Masuk Tepat Waktu</Label>
                            <Input id="deadline" type="time" value={data.deadline} onChange={(e) => setData('deadline', e.target.value)} required />
                            <InputError message={errors.deadline} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="full_day_after">Ambang Potong Cuti Penuh</Label>
                            <Input id="full_day_after" type="time" value={data.full_day_after} onChange={(e) => setData('full_day_after', e.target.value)} required />
                            <InputError message={errors.full_day_after} />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Contoh: batas {data.deadline}, ambang penuh {data.full_day_after} → masuk {data.deadline}–{data.full_day_after} potong ½ hari, setelah {data.full_day_after} potong 1 hari.
                    </p>
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
