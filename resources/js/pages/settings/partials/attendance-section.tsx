import { Can } from '@/components/can';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm } from '@inertiajs/react';
import { type FormEventHandler } from 'react';

interface Props {
    attendance: { deadline: string; full_day_after: string; period_start_day: number };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Contoh rentang periode untuk bulan ini berdasarkan tanggal awal yang dipilih. */
function periodExample(startDay: number): string {
    const day = Number.isFinite(startDay) && startDay >= 1 && startDay <= 28 ? Math.floor(startDay) : 20;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), day);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, day);
    to.setDate(to.getDate() - 1);
    const fmt = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    return `${fmt(from)} – ${fmt(to)}`;
}

/** Label tanggal akhir periode: sehari sebelum tanggal awal bulan berikutnya. */
function periodEndLabel(startDay: number): string {
    const day = Number.isFinite(startDay) && startDay >= 1 && startDay <= 28 ? Math.floor(startDay) : 20;
    return day === 1 ? 'Akhir bulan (28/29/30/31)' : `${day - 1} bulan berikutnya`;
}

export default function AttendanceSection({ attendance }: Props) {
    const { data, setData, put, processing, errors, recentlySuccessful } = useForm({
        deadline: attendance.deadline,
        full_day_after: attendance.full_day_after,
        period_start_day: attendance.period_start_day ?? 20,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        put(route('hr-settings.attendance'), { preserveScroll: true });
    };

    const startDay = Number(data.period_start_day);

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

                    <div className="mt-2 border-t pt-4">
                        <h3 className="text-sm font-semibold">Periode Absensi & Lembur</h3>
                        <p className="mb-3 text-sm text-muted-foreground">
                            Tanggal awal periode penggajian. Periode berjalan dari tanggal ini sampai sehari sebelum tanggal yang sama di bulan berikutnya. Dipakai oleh Rekap Kehadiran, Lembur, dan Attend Case.
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="period_start_day">Tanggal Awal Periode</Label>
                                <Input
                                    id="period_start_day"
                                    type="number"
                                    min={1}
                                    max={28}
                                    step={1}
                                    value={data.period_start_day}
                                    onChange={(e) => setData('period_start_day', e.target.value === '' ? ('' as unknown as number) : Number(e.target.value))}
                                    required
                                />
                                <InputError message={errors.period_start_day} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="period_end_day">Tanggal Akhir Periode</Label>
                                <Input id="period_end_day" value={periodEndLabel(startDay)} readOnly disabled className="bg-muted/50" />
                                <p className="text-[11px] text-muted-foreground">Otomatis: sehari sebelum tanggal awal di bulan berikutnya.</p>
                            </div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            Contoh periode bulan ini: {periodExample(startDay)}. Isi 1 untuk periode bulan kalender penuh. Maksimal 28 agar selalu ada di semua bulan.
                        </p>
                        <p className="mt-1 text-xs text-amber-600">
                            Mengubah tanggal ini hanya memengaruhi tampilan periode ke depan. Periode lembur yang sudah dibuat tetap memakai rentang tanggal saat dibuat.
                        </p>
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
