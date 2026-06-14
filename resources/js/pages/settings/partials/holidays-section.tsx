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
import { router, useForm } from '@inertiajs/react';
import { Pencil, Plus } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

interface Holiday { id: number; date: string; name: string; type: string; is_workday_override: boolean }
const TYPE_LABEL: Record<string, string> = { national: 'Nasional', collective: 'Cuti Bersama', company: 'Perusahaan' };

export default function HolidaysSection({ year, holidays }: { year: number; holidays: Holiday[] }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Holiday | null>(null);
    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm<{ date: string; name: string; type: string; is_workday_override: boolean }>({
        date: '', name: '', type: 'national', is_workday_override: false,
    });

    const openCreate = () => { reset(); clearErrors(); setEditing(null); setOpen(true); };
    const openEdit = (h: Holiday) => { clearErrors(); setEditing(h); setData({ date: h.date.substring(0, 10), name: h.name, type: h.type, is_workday_override: h.is_workday_override }); setOpen(true); };
    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        editing ? put(route('leave-holidays.update', editing.id), opts) : post(route('leave-holidays.store'), opts);
    };

    const changeYear = (y: string) => {
        router.get(route('hr-settings.index'), { year: y }, { preserveState: true, preserveScroll: true, replace: true, only: ['holidays', 'holidayYear'] });
    };

    return (
        <Card>
            <CardContent className="py-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h2 className="text-base font-semibold">Hari Libur {year}</h2>
                        <p className="text-sm text-muted-foreground">Kalender libur nasional/cuti bersama/perusahaan (dipakai perhitungan cuti & lembur).</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input type="number" className="w-24" value={year} onChange={(e) => changeYear(e.target.value)} />
                        <Can on="hr-settings" do="create"><Button onClick={openCreate}><Plus className="size-4" /> Tambah</Button></Can>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-md border">
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
                                            <Can on="hr-settings" do="edit"><Button variant="ghost" size="icon" onClick={() => openEdit(h)}><Pencil className="size-4" /></Button></Can>
                                            <Can on="hr-settings" do="delete"><ConfirmDelete url={route('leave-holidays.destroy', h.id)} title={`Hapus ${h.name}?`} /></Can>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editing ? 'Ubah Hari Libur' : 'Tambah Hari Libur'}</DialogTitle></DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2"><Label htmlFor="hdate">Tanggal *</Label><Input id="hdate" type="date" value={data.date} onChange={(e) => setData('date', e.target.value)} required /><InputError message={errors.date} /></div>
                            <div className="grid gap-2"><Label>Jenis</Label>
                                <Select value={data.type} onValueChange={(v) => setData('type', v)}><SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="national">Nasional</SelectItem><SelectItem value="collective">Cuti Bersama</SelectItem><SelectItem value="company">Perusahaan</SelectItem></SelectContent></Select>
                            </div>
                        </div>
                        <div className="grid gap-2"><Label htmlFor="hname">Nama *</Label><Input id="hname" value={data.name} onChange={(e) => setData('name', e.target.value)} required /><InputError message={errors.name} /></div>
                        <DialogFooter><Button type="submit" disabled={processing}>Simpan</Button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
