import InputError from '@/components/input-error';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type Lookup } from '@/types';

const NONE = 'none';
const STATUSES = ['active', 'probation', 'suspended', 'terminated', 'resigned', 'retired'];

export interface AssignmentOptions {
    companies: Lookup[];
    orgUnits: Lookup[];
    positions: Lookup[];
    jobs: Lookup[];
    jobGrades: Lookup[];
    costCenters: Lookup[];
    locations: Lookup[];
    employeeGroups: Lookup[];
    employeeSubgroups: Lookup[];
    employmentTypes: Lookup[];
    managers: { id: number; full_name: string | null; employee_code: string | null }[];
}

interface Props {
    data: Record<string, unknown>;
    setData: (key: string, value: string) => void;
    errors: Partial<Record<string, string>>;
    options: AssignmentOptions;
}

export default function AssignmentFields({ data, setData, errors, options }: Props) {
    const str = (k: string) => (data[k] as string) ?? '';

    const field = (id: string, label: string, items: Lookup[]) => (
        <div className="grid gap-2">
            <Label htmlFor={id}>{label}</Label>
            <Select value={str(id) || NONE} onValueChange={(v) => setData(id, v === NONE ? '' : v)}>
                <SelectTrigger id={id}>
                    <SelectValue placeholder={`Pilih ${label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NONE}>- Tidak ada -</SelectItem>
                    {items.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>
                            {o.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <InputError message={errors[id]} />
        </div>
    );

    return (
        <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-3">
                {field('company_id', 'Company', options.companies)}
                {field('org_unit_id', 'Unit Organisasi', options.orgUnits)}
                {field('position_id', 'Posisi', options.positions)}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
                {field('job_catalog_id', 'Job', options.jobs)}
                {field('job_grade_id', 'Grade', options.jobGrades)}
                {field('location_id', 'Lokasi Kerja', options.locations)}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
                {field('cost_center_id', 'Cost Center', options.costCenters)}
                {field('employee_group_id', 'Employee Group', options.employeeGroups)}
                {field('employee_subgroup_id', 'Employee Subgroup', options.employeeSubgroups)}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
                {field('employment_type_id', 'Tipe Kepegawaian', options.employmentTypes)}
                <div className="grid gap-2">
                    <Label htmlFor="reports_to_employee_id">Atasan Langsung</Label>
                    <Select value={str('reports_to_employee_id') || NONE} onValueChange={(v) => setData('reports_to_employee_id', v === NONE ? '' : v)}>
                        <SelectTrigger id="reports_to_employee_id">
                            <SelectValue placeholder="Pilih atasan" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>- Tidak ada -</SelectItem>
                            {options.managers.map((m) => (
                                <SelectItem key={m.id} value={String(m.id)}>
                                    {m.full_name} ({m.employee_code})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="employment_status">Status</Label>
                    <Select value={str('employment_status') || 'active'} onValueChange={(v) => setData('employment_status', v)}>
                        <SelectTrigger id="employment_status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUSES.map((s) => (
                                <SelectItem key={s} value={s} className="capitalize">
                                    {s}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <InputError message={errors.employment_status} />
                </div>
            </div>
        </div>
    );
}
