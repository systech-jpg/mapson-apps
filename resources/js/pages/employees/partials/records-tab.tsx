import { Can } from '@/components/can';
import { ConfirmDelete } from '@/components/confirm-delete';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useForm } from '@inertiajs/react';
import { Pencil, Plus } from 'lucide-react';
import { type FormEventHandler, type ReactNode, useState } from 'react';

export interface FieldSpec {
    key: string;
    label: string;
    input?: 'text' | 'select' | 'date' | 'number' | 'switch';
    options?: { v: string; l: string }[];
    required?: boolean;
    placeholder?: string;
    /** Full-width row in the dialog grid. */
    wide?: boolean;
}

export interface ColumnSpec {
    key: string;
    label: string;
    render?: (r: Record<string, unknown>) => ReactNode;
}

interface Props {
    title: string;
    employeeId: number;
    /** Route segment: addresses | contacts | emergency-contacts | educations | bank-accounts */
    type: string;
    records: Array<Record<string, unknown> & { id: number }>;
    fields: FieldSpec[];
    columns: ColumnSpec[];
    addLabel?: string;
}

export default function RecordsTab({ title, employeeId, type, records, fields, columns, addLabel = 'Tambah' }: Props) {
    const [open, setOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    const initial = Object.fromEntries(fields.map((f) => [f.key, f.input === 'switch' ? false : '']));
    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm<Record<string, string | boolean>>(initial);

    const openCreate = () => {
        reset();
        clearErrors();
        setEditingId(null);
        setOpen(true);
    };

    const openEdit = (r: Record<string, unknown> & { id: number }) => {
        clearErrors();
        setEditingId(r.id);
        setData(
            Object.fromEntries(
                fields.map((f) => {
                    const v = r[f.key];
                    if (f.input === 'switch') return [f.key, Boolean(v)];
                    if (f.input === 'date') return [f.key, v ? String(v).substring(0, 10) : ''];
                    return [f.key, v === null || v === undefined ? '' : String(v)];
                }),
            ) as Record<string, string | boolean>,
        );
        setOpen(true);
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        editingId
            ? put(route('employees.sub.update', [employeeId, type, editingId]), opts)
            : post(route('employees.sub.store', [employeeId, type]), opts);
    };

    const renderCell = (r: Record<string, unknown>, c: ColumnSpec): ReactNode => {
        if (c.render) return c.render(r);
        const v = r[c.key];
        if (typeof v === 'boolean') return v ? <Badge>Ya</Badge> : <span className="text-xs text-muted-foreground">-</span>;
        return v === null || v === undefined || v === '' ? '-' : String(v);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{title}</CardTitle>
                <Can on="employees" do="edit">
                    <Button size="sm" onClick={openCreate}>
                        <Plus className="size-4" /> {addLabel}
                    </Button>
                </Can>
            </CardHeader>
            <CardContent>
                <Table className="text-sm">
                    <TableHeader>
                        <TableRow>
                            {columns.map((c) => (
                                <TableHead key={c.key}>{c.label}</TableHead>
                            ))}
                            <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {records.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={columns.length + 1} className="text-center text-muted-foreground">
                                    Belum ada data.
                                </TableCell>
                            </TableRow>
                        )}
                        {records.map((r) => (
                            <TableRow key={r.id}>
                                {columns.map((c) => (
                                    <TableCell key={c.key} className="max-w-[260px] truncate">
                                        {renderCell(r, c)}
                                    </TableCell>
                                ))}
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <Can on="employees" do="edit">
                                            <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                                                <Pencil className="size-4" />
                                            </Button>
                                        </Can>
                                        <Can on="employees" do="delete">
                                            <ConfirmDelete url={route('employees.sub.destroy', [employeeId, type, r.id])} title={`Hapus ${title.toLowerCase()} ini?`} />
                                        </Can>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingId ? `Ubah ${title}` : `Tambah ${title}`}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            {fields.map((f) => (
                                <div key={f.key} className={`grid gap-2 ${f.wide ? 'col-span-2' : ''} ${f.input === 'switch' ? 'col-span-2 flex flex-row items-center gap-3' : ''}`}>
                                    {f.input === 'switch' ? (
                                        <>
                                            <Switch id={f.key} checked={Boolean(data[f.key])} onCheckedChange={(v) => setData(f.key, v)} />
                                            <Label htmlFor={f.key}>{f.label}</Label>
                                        </>
                                    ) : f.input === 'select' ? (
                                        <>
                                            <Label htmlFor={f.key}>{f.label}{f.required ? ' *' : ''}</Label>
                                            <Select value={String(data[f.key] ?? '')} onValueChange={(v) => setData(f.key, v)}>
                                                <SelectTrigger id={f.key}>
                                                    <SelectValue placeholder="Pilih" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {(f.options ?? []).map((o) => (
                                                        <SelectItem key={o.v} value={o.v}>
                                                            {o.l}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <InputError message={errors[f.key]} />
                                        </>
                                    ) : (
                                        <>
                                            <Label htmlFor={f.key}>{f.label}{f.required ? ' *' : ''}</Label>
                                            <Input
                                                id={f.key}
                                                type={f.input === 'date' ? 'date' : f.input === 'number' ? 'number' : 'text'}
                                                step={f.input === 'number' ? 'any' : undefined}
                                                value={String(data[f.key] ?? '')}
                                                onChange={(e) => setData(f.key, e.target.value)}
                                                required={f.required}
                                                placeholder={f.placeholder}
                                            />
                                            <InputError message={errors[f.key]} />
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={processing}>
                                Simpan
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
