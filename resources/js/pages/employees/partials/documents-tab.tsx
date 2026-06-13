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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useForm } from '@inertiajs/react';
import { Download, Pencil, Upload } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

export interface EmployeeDocumentRow {
    id: number;
    category: string;
    title: string;
    original_name: string | null;
    mime: string | null;
    size: number | null;
    issued_date: string | null;
    expiry_date: string | null;
    notes: string | null;
    uploader?: { id: number; name: string } | null;
    created_at?: string;
}

const CATEGORIES = [
    { v: 'ktp', l: 'KTP' },
    { v: 'npwp', l: 'NPWP' },
    { v: 'ijazah', l: 'Ijazah' },
    { v: 'contract', l: 'Kontrak' },
    { v: 'bpjs', l: 'BPJS' },
    { v: 'photo', l: 'Foto' },
    { v: 'certificate', l: 'Sertifikat' },
    { v: 'other', l: 'Lainnya' },
];

const catLabel = (v: string) => CATEGORIES.find((c) => c.v === v)?.l ?? v;
const dateOnly = (v: string | null) => (v ? v.substring(0, 10) : '-');
const fmtSize = (b: number | null) => {
    if (!b) return '';
    if (b > 1048576) return `${(b / 1048576).toFixed(1)} MB`;
    return `${Math.ceil(b / 1024)} KB`;
};

export default function DocumentsTab({ employeeId, documents }: { employeeId: number; documents: EmployeeDocumentRow[] }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<EmployeeDocumentRow | null>(null);

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm<{
        category: string;
        title: string;
        file: File | null;
        issued_date: string;
        expiry_date: string;
        notes: string;
    }>({ category: 'other', title: '', file: null, issued_date: '', expiry_date: '', notes: '' });

    const openCreate = () => {
        reset();
        clearErrors();
        setEditing(null);
        setOpen(true);
    };

    const openEdit = (d: EmployeeDocumentRow) => {
        clearErrors();
        setEditing(d);
        setData({
            category: d.category,
            title: d.title,
            file: null,
            issued_date: d.issued_date ? d.issued_date.substring(0, 10) : '',
            expiry_date: d.expiry_date ? d.expiry_date.substring(0, 10) : '',
            notes: d.notes ?? '',
        });
        setOpen(true);
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        editing
            ? put(route('employees.documents.update', [employeeId, editing.id]), opts)
            : post(route('employees.documents.store', employeeId), { ...opts, forceFormData: true });
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Dokumen</CardTitle>
                <Can on="employees" do="edit">
                    <Button size="sm" onClick={openCreate}>
                        <Upload className="size-4" /> Unggah Dokumen
                    </Button>
                </Can>
            </CardHeader>
            <CardContent>
                <Table className="text-sm">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Kategori</TableHead>
                            <TableHead>Judul</TableHead>
                            <TableHead>File</TableHead>
                            <TableHead>Terbit</TableHead>
                            <TableHead>Kedaluwarsa</TableHead>
                            <TableHead>Diunggah oleh</TableHead>
                            <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {documents.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground">
                                    Belum ada dokumen. Unggah KTP, NPWP, ijazah, kontrak, dll (PDF/JPG/PNG, maks 5MB).
                                </TableCell>
                            </TableRow>
                        )}
                        {documents.map((d) => (
                            <TableRow key={d.id}>
                                <TableCell>
                                    <Badge variant="secondary">{catLabel(d.category)}</Badge>
                                </TableCell>
                                <TableCell className="max-w-[220px] truncate font-medium" title={d.title}>{d.title}</TableCell>
                                <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground" title={d.original_name ?? ''}>
                                    {d.original_name ?? '-'} {d.size ? `(${fmtSize(d.size)})` : ''}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">{dateOnly(d.issued_date)}</TableCell>
                                <TableCell className="whitespace-nowrap">{dateOnly(d.expiry_date)}</TableCell>
                                <TableCell>{d.uploader?.name ?? '-'}</TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <Button variant="ghost" size="icon" asChild title="Unduh">
                                            <a href={route('employees.documents.download', [employeeId, d.id])}>
                                                <Download className="size-4" />
                                            </a>
                                        </Button>
                                        <Can on="employees" do="edit">
                                            <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                                                <Pencil className="size-4" />
                                            </Button>
                                        </Can>
                                        <Can on="employees" do="delete">
                                            <ConfirmDelete url={route('employees.documents.destroy', [employeeId, d.id])} title={`Hapus dokumen "${d.title}"?`} description="File akan dihapus permanen dari server." />
                                        </Can>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Ubah Info Dokumen' : 'Unggah Dokumen'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="doc-category">Kategori *</Label>
                                <Select value={data.category} onValueChange={(v) => setData('category', v)}>
                                    <SelectTrigger id="doc-category">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CATEGORIES.map((c) => (
                                            <SelectItem key={c.v} value={c.v}>
                                                {c.l}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <InputError message={errors.category} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="doc-title">Judul *</Label>
                                <Input id="doc-title" value={data.title} onChange={(e) => setData('title', e.target.value)} required placeholder="mis. KTP a.n. Abi Gusnadi" />
                                <InputError message={errors.title} />
                            </div>
                        </div>
                        {!editing && (
                            <div className="grid gap-2">
                                <Label htmlFor="doc-file">File * (PDF/JPG/PNG, maks 5MB)</Label>
                                <Input id="doc-file" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setData('file', e.target.files?.[0] ?? null)} required />
                                <InputError message={errors.file} />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="doc-issued">Tanggal Terbit</Label>
                                <Input id="doc-issued" type="date" value={data.issued_date} onChange={(e) => setData('issued_date', e.target.value)} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="doc-expiry">Kedaluwarsa</Label>
                                <Input id="doc-expiry" type="date" value={data.expiry_date} onChange={(e) => setData('expiry_date', e.target.value)} />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="doc-notes">Catatan</Label>
                            <Input id="doc-notes" value={data.notes} onChange={(e) => setData('notes', e.target.value)} />
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={processing}>
                                {editing ? 'Simpan' : 'Unggah'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
