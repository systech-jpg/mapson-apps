import InputError from '@/components/input-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { type DepartmentBrief, type PositionBrief, type RoleBrief } from '@/types';

export interface UserFormData {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
    role_id: string;
    is_active: boolean;
    department_id: string;
    position_id: string;
    employee_code: string;
    phone: string;
    hire_date: string;
    address: string;
    [key: string]: string | boolean;
}

interface Props {
    data: UserFormData;
    setData: (key: string, value: string | boolean) => void;
    errors: Partial<Record<string, string>>;
    roles: RoleBrief[];
    departments: DepartmentBrief[];
    positions: PositionBrief[];
    isEdit?: boolean;
}

const NONE = 'none';

export default function UserFormFields({ data, setData, errors, roles, departments, positions, isEdit }: Props) {
    return (
        <div className="grid gap-8">
            <section className="grid gap-4">
                <h3 className="text-sm font-medium text-muted-foreground">Akun</h3>

                <div className="grid gap-2 md:grid-cols-2 md:gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Nama</Label>
                        <Input id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} required autoFocus />
                        <InputError message={errors.name} />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} required />
                        <InputError message={errors.email} />
                    </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2 md:gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="password">
                            Password {isEdit && <span className="text-muted-foreground">(kosongkan jika tidak diubah)</span>}
                        </Label>
                        <Input id="password" type="password" value={data.password} onChange={(e) => setData('password', e.target.value)} autoComplete="new-password" />
                        <InputError message={errors.password} />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="password_confirmation">Konfirmasi Password</Label>
                        <Input
                            id="password_confirmation"
                            type="password"
                            value={data.password_confirmation}
                            onChange={(e) => setData('password_confirmation', e.target.value)}
                            autoComplete="new-password"
                        />
                    </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2 md:gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="role_id">Role</Label>
                        <Select value={data.role_id} onValueChange={(v) => setData('role_id', v)}>
                            <SelectTrigger id="role_id">
                                <SelectValue placeholder="Pilih role" />
                            </SelectTrigger>
                            <SelectContent>
                                {roles.map((role) => (
                                    <SelectItem key={role.id} value={String(role.id)}>
                                        {role.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <InputError message={errors.role_id} />
                    </div>

                    <div className="flex items-center gap-3 pt-7">
                        <Switch id="is_active" checked={data.is_active} onCheckedChange={(v) => setData('is_active', v)} />
                        <Label htmlFor="is_active">User aktif</Label>
                    </div>
                </div>
            </section>

            <section className="grid gap-4">
                <h3 className="text-sm font-medium text-muted-foreground">Data Employee</h3>

                <div className="grid gap-2 md:grid-cols-2 md:gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="department_id">Departemen</Label>
                        <Select value={data.department_id || NONE} onValueChange={(v) => setData('department_id', v === NONE ? '' : v)}>
                            <SelectTrigger id="department_id">
                                <SelectValue placeholder="Pilih departemen" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE}>- Tidak ada -</SelectItem>
                                {departments.map((d) => (
                                    <SelectItem key={d.id} value={String(d.id)}>
                                        {d.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <InputError message={errors.department_id} />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="position_id">Jabatan</Label>
                        <Select value={data.position_id || NONE} onValueChange={(v) => setData('position_id', v === NONE ? '' : v)}>
                            <SelectTrigger id="position_id">
                                <SelectValue placeholder="Pilih jabatan" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE}>- Tidak ada -</SelectItem>
                                {positions.map((p) => (
                                    <SelectItem key={p.id} value={String(p.id)}>
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <InputError message={errors.position_id} />
                    </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2 md:gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="employee_code">NIP / Kode Employee</Label>
                        <Input id="employee_code" value={data.employee_code} onChange={(e) => setData('employee_code', e.target.value)} />
                        <InputError message={errors.employee_code} />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="phone">No. HP</Label>
                        <Input id="phone" value={data.phone} onChange={(e) => setData('phone', e.target.value)} />
                        <InputError message={errors.phone} />
                    </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2 md:gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="hire_date">Tanggal Bergabung</Label>
                        <Input id="hire_date" type="date" value={data.hire_date} onChange={(e) => setData('hire_date', e.target.value)} />
                        <InputError message={errors.hire_date} />
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="address">Alamat</Label>
                    <Textarea id="address" value={data.address} onChange={(e) => setData('address', e.target.value)} />
                    <InputError message={errors.address} />
                </div>
            </section>
        </div>
    );
}
