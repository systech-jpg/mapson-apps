import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type Employee } from '@/types';
import { useForm } from '@inertiajs/react';
import { ArrowLeftRight } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';
import AssignmentFields, { type AssignmentOptions } from './assignment-fields';

const ACTIONS = ['transfer', 'promotion', 'demotion', 'status_change', 'reorg', 'termination'];

interface Props {
    employee: Employee;
    options: AssignmentOptions;
}

export default function ChangeAssignmentDialog({ employee, options }: Props) {
    const [open, setOpen] = useState(false);

    const { data, setData, post, processing, errors, reset } = useForm<Record<string, string>>({
        action_type: 'transfer',
        valid_from: new Date().toISOString().substring(0, 10),
        company_id: String(employee.current_company?.id ?? ''),
        org_unit_id: String(employee.current_org_unit?.id ?? ''),
        position_id: String(employee.current_position?.id ?? ''),
        job_catalog_id: '',
        job_grade_id: String(employee.current_job_grade?.id ?? ''),
        cost_center_id: '',
        location_id: String(employee.current_location?.id ?? ''),
        employee_group_id: String(employee.current_employee_group?.id ?? ''),
        employee_subgroup_id: String(employee.current_employee_subgroup?.id ?? ''),
        employment_type_id: String(employee.current_employment_type?.id ?? ''),
        employment_status: employee.current_employment_status ?? 'active',
        reports_to_employee_id: String(employee.reports_to_employee_id ?? ''),
        reason: '',
        notes: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('employees.assignment', employee.id), {
            preserveScroll: true,
            onSuccess: () => {
                reset();
                setOpen(false);
            },
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <ArrowLeftRight className="size-4" /> Ubah Penempatan
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Ubah Penempatan</DialogTitle>
                    <DialogDescription>Perubahan ini membuat periode riwayat baru (effective-dated).</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="grid gap-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                            <Label htmlFor="action_type">Jenis Aksi</Label>
                            <Select value={data.action_type} onValueChange={(v) => setData('action_type', v)}>
                                <SelectTrigger id="action_type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ACTIONS.map((a) => (
                                        <SelectItem key={a} value={a} className="capitalize">
                                            {a.replace('_', ' ')}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <InputError message={errors.action_type} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="valid_from">Berlaku Mulai *</Label>
                            <Input id="valid_from" type="date" value={data.valid_from} onChange={(e) => setData('valid_from', e.target.value)} required />
                            <InputError message={errors.valid_from} />
                        </div>
                    </div>

                    <AssignmentFields data={data} setData={setData} errors={errors} options={options} />

                    <div className="grid gap-2">
                        <Label htmlFor="reason">Alasan</Label>
                        <Input id="reason" value={data.reason} onChange={(e) => setData('reason', e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="notes">Catatan</Label>
                        <Textarea id="notes" value={data.notes} onChange={(e) => setData('notes', e.target.value)} />
                    </div>

                    <DialogFooter>
                        <Button type="submit" disabled={processing}>
                            Simpan Perubahan
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
