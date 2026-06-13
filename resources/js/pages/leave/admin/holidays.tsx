import { Can } from '@/components/can';
import { ConfirmDelete } from '@/components/confirm-delete';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Pencil, Plus } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Kelola Cuti', href: '#' },
    { title: 'Hari Libur', href: '/leave-holidays' },
];

interface Holiday { id: number; date: string; name: string; type: string; is_workday_override: boolean }
const TYPE_LABEL: Record<string, string> = { national: 'Nasional', collective: 'Cuti Bersama', company: 'Perusahaan' };

export default function Holidays({ year, holidays }: { year: number; holidays: Holiday[] }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Holiday | null>(null);
    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm<{ date: string; name: string; type: string; is_workday_override: boolean }>({
        date: '', name: '', type: 'national', is_workday_override: false,
    });

    const openCreate = () => { reset(); clearErrors(); setEditing(null); setOpen(true); };
    const openEdit = (h: Holiday) => { clearErrors(); setEditing(h); setData({ date: h.date.substring(0, 10), name: h.name, type: h.type, is_workday_override: h.is_workday_override }); setOpen(true); };
    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const opts = { onSuccess: () => setOpen(false) };
        editing ? put(route('leave-holidays.update', editing.id), opts) : post(route('leave-holidays.store'), opts);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Hari Libur" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-xl font-semibold">Hari Libur {year}</h1>
                    <div className="flex items-center gap-2">
                        <Input type="number" className="w-24" value={year} onChange={(e) => router.get(route('leave-holidays.index'), { year: e.target.value }, { preserveState: true, replace: true })} />
                        <Can on="leave-holidays" do="create"><Button onClick={openCreate}><Plus className="size-4" /> Tambah</Button></Can>
                    </div>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                            <TableHeader>
                                <TableRow><TableHead>Tanggal</TableHead><TableHead>Nama</TableHead><TableHead>Jenis</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow>
                            </TableHeader>
                            <TableBody>
                                {holidays.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Belum ada hari libur untuk {year}.</TableCell></TableRow>
                                ) : holidays.map((h) => (
                                    <TableRow key={h.id}>
                                        <TableCell className="whitespace-nowrap">{h.date.substring(0, 10)}</TableCell>
                                        <TableCell className="font-medium">{h.name}{h.is_workday_override && <span className="ml-1 text-xs text-muted-foreground">(hari kerja pengganti)</span>}</TableCell>
                                        <TableCell><Badge variant="secondary">{TYPE_LABEL[h.type] ?? h.type}</Badge></TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Can on="leave-holidays" do="edit"><Button variant="ghost" size="icon" onClick={() => openEdit(h)}><Pencil className="size-4" /></Button></Can>
                                                <Can on="leave-holidays" do="delete"><ConfirmDelete url={route('leave-holidays.destroy', h.id)} title={`Hapus ${h.name}?`} /></Can>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editing ? 'Ubah Hari Libur' : 'Tambah Hari Libur'}</DialogTitle></DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2"><Label htmlFor="date">Tanggal *</Label><Input id="date" type="date" value={data.date} onChange={(e) => setData('date', e.target.value)} required /><InputError message={errors.date} /></div>
                            <div className="grid gap-2"><Label>Jenis</Label>
                                <Select value={data.type} onValueChange={(v) => setData('type', v)}><SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="national">Nasional</SelectItem><SelectItem value="collective">Cuti Bersama</SelectItem><SelectItem value="company">Perusahaan</SelectItem></SelectContent></Select>
                            </div>
                        </div>
                        <div className="grid gap-2"><Label htmlFor="name">Nama *</Label><Input id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} required /><InputError message={errors.name} /></div>
                        <DialogFooter><Button type="submit" disabled={processing}>Simpan</Button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
