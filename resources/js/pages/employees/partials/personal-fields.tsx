import InputError from '@/components/input-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { type Lookup } from '@/types';

const NONE = 'none';

const GENDERS = [
    { v: 'male', l: 'Laki-laki' },
    { v: 'female', l: 'Perempuan' },
];
const RELIGIONS = ['islam', 'kristen', 'katolik', 'hindu', 'buddha', 'konghucu', 'lainnya'];
const MARITAL = ['single', 'married', 'divorced', 'widowed'];
const BLOOD = ['A', 'B', 'AB', 'O'];

interface Props {
    data: Record<string, unknown>;
    setData: (key: string, value: string | boolean) => void;
    errors: Partial<Record<string, string>>;
    linkableUsers?: (Lookup & { email?: string })[];
}

export default function PersonalFields({ data, setData, errors, linkableUsers }: Props) {
    const str = (k: string) => (data[k] as string) ?? '';

    return (
        <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                    <Label htmlFor="employee_code">NIP / Kode *</Label>
                    <Input id="employee_code" value={str('employee_code')} onChange={(e) => setData('employee_code', e.target.value)} required />
                    <InputError message={errors.employee_code} />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="first_name">Nama Depan *</Label>
                    <Input id="first_name" value={str('first_name')} onChange={(e) => setData('first_name', e.target.value)} required />
                    <InputError message={errors.first_name} />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="last_name">Nama Belakang</Label>
                    <Input id="last_name" value={str('last_name')} onChange={(e) => setData('last_name', e.target.value)} />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                    <Label htmlFor="nik_ktp">NIK / KTP</Label>
                    <Input id="nik_ktp" value={str('nik_ktp')} onChange={(e) => setData('nik_ktp', e.target.value)} />
                    <InputError message={errors.nik_ktp} />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="npwp">NPWP</Label>
                    <Input id="npwp" value={str('npwp')} onChange={(e) => setData('npwp', e.target.value)} />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="gender">Jenis Kelamin</Label>
                    <Select value={str('gender') || NONE} onValueChange={(v) => setData('gender', v === NONE ? '' : v)}>
                        <SelectTrigger id="gender">
                            <SelectValue placeholder="Pilih" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>- Tidak diisi -</SelectItem>
                            {GENDERS.map((g) => (
                                <SelectItem key={g.v} value={g.v}>
                                    {g.l}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                    <Label htmlFor="birth_place">Tempat Lahir</Label>
                    <Input id="birth_place" value={str('birth_place')} onChange={(e) => setData('birth_place', e.target.value)} />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="birth_date">Tanggal Lahir</Label>
                    <Input id="birth_date" type="date" value={str('birth_date')} onChange={(e) => setData('birth_date', e.target.value)} />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="religion">Agama</Label>
                    <Select value={str('religion') || NONE} onValueChange={(v) => setData('religion', v === NONE ? '' : v)}>
                        <SelectTrigger id="religion">
                            <SelectValue placeholder="Pilih" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>- Tidak diisi -</SelectItem>
                            {RELIGIONS.map((r) => (
                                <SelectItem key={r} value={r} className="capitalize">
                                    {r}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                    <Label htmlFor="marital_status">Status Pernikahan</Label>
                    <Select value={str('marital_status') || NONE} onValueChange={(v) => setData('marital_status', v === NONE ? '' : v)}>
                        <SelectTrigger id="marital_status">
                            <SelectValue placeholder="Pilih" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>- Tidak diisi -</SelectItem>
                            {MARITAL.map((m) => (
                                <SelectItem key={m} value={m} className="capitalize">
                                    {m}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="nationality">Kewarganegaraan</Label>
                    <Input id="nationality" value={str('nationality')} onChange={(e) => setData('nationality', e.target.value)} />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="blood_type">Golongan Darah</Label>
                    <Select value={str('blood_type') || NONE} onValueChange={(v) => setData('blood_type', v === NONE ? '' : v)}>
                        <SelectTrigger id="blood_type">
                            <SelectValue placeholder="Pilih" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>- Tidak diisi -</SelectItem>
                            {BLOOD.map((b) => (
                                <SelectItem key={b} value={b}>
                                    {b}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                    <Label htmlFor="bpjs_kesehatan_no">BPJS Kesehatan</Label>
                    <Input id="bpjs_kesehatan_no" value={str('bpjs_kesehatan_no')} onChange={(e) => setData('bpjs_kesehatan_no', e.target.value)} />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="bpjs_ketenagakerjaan_no">BPJS Ketenagakerjaan</Label>
                    <Input id="bpjs_ketenagakerjaan_no" value={str('bpjs_ketenagakerjaan_no')} onChange={(e) => setData('bpjs_ketenagakerjaan_no', e.target.value)} />
                </div>
                {linkableUsers && (
                    <div className="grid gap-2">
                        <Label htmlFor="user_id">Akun Login (opsional)</Label>
                        <Select value={str('user_id') || NONE} onValueChange={(v) => setData('user_id', v === NONE ? '' : v)}>
                            <SelectTrigger id="user_id">
                                <SelectValue placeholder="Tanpa akun" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE}>- Tanpa akun -</SelectItem>
                                {linkableUsers.map((u) => (
                                    <SelectItem key={u.id} value={String(u.id)}>
                                        {u.name} {u.email ? `(${u.email})` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <InputError message={errors.user_id} />
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3">
                <Switch id="is_active" checked={Boolean(data.is_active)} onCheckedChange={(v) => setData('is_active', v)} />
                <Label htmlFor="is_active">Employee aktif</Label>
            </div>
        </div>
    );
}
