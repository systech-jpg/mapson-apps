import { Can } from '@/components/can';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Human Resources', href: '#' },
    { title: 'Kelola Cuti', href: '#' },
    { title: 'Saldo Karyawan', href: '/leave-admin/balances' },
];

interface TypeOpt { id: number; code: string; name: string }
interface BalCell { available: number; allotted: number; used: number; pending: number }
interface Row { employee_id: number; name: string; code: string; balances: Record<string, BalCell> }

interface Props {
    year: number;
    search: string;
    types: TypeOpt[];
    rows: { data: Row[]; links: { url: string | null; label: string; active: boolean }[]; total: number };
}

export default function AdminBalances({ year, search: initialSearch, types, rows }: Props) {
    const [search, setSearch] = useState(initialSearch ?? '');
    const [adjust, setAdjust] = useState<{ row: Row } | null>(null);

    const form = useForm<{ employee_id: string; leave_type_id: string; year: string; delta: string }>({
        employee_id: '', leave_type_id: types[0] ? String(types[0].id) : '', year: String(year), delta: '',
    });

    const reload = (extra: Record<string, unknown> = {}) =>
        router.get(route('leave.admin.balances'), { year, search, ...extra }, { preserveState: true, replace: true });

    const openAdjust = (row: Row) => {
        form.setData({ employee_id: String(row.employee_id), leave_type_id: types[0] ? String(types[0].id) : '', year: String(year), delta: '' });
        setAdjust({ row });
    };

    const submitAdjust = () => form.post(route('leave.admin.balances.adjust'), { preserveScroll: true, onSuccess: () => setAdjust(null) });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Saldo Cuti Karyawan" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-xl font-semibold">Saldo Cuti Karyawan — {year}</h1>
                    <div className="flex items-center gap-2">
                        <Input type="number" className="w-24" value={year} onChange={(e) => reload({ year: e.target.value })} />
                        <Can on="leave-admin-balances" do="edit">
                            <Button variant="outline" size="sm" onClick={() => router.post(route('leave.admin.balances.accrue'), { year }, { preserveScroll: true })}>
                                <RefreshCw className="size-4" /> Jalankan Akrual {year}
                            </Button>
                        </Can>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Input className="w-64" placeholder="Cari karyawan / NIP" value={search}
                        onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && reload()} />
                    <Button variant="outline" size="icon" onClick={() => reload()}><Search className="size-4" /></Button>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table className="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-9 [&_th]:px-3">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Karyawan</TableHead>
                                        {types.map((t) => <TableHead key={t.id} className="text-right">{t.name}</TableHead>)}
                                        <TableHead className="text-right">Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.data.length === 0 ? (
                                        <TableRow><TableCell colSpan={types.length + 2} className="py-10 text-center text-muted-foreground">Tidak ada data.</TableCell></TableRow>
                                    ) : rows.data.map((r) => (
                                        <TableRow key={r.employee_id}>
                                            <TableCell>
                                                <div className="font-medium">{r.name}</div>
                                                <div className="text-xs text-muted-foreground">{r.code}</div>
                                            </TableCell>
                                            {types.map((t) => {
                                                const b = r.balances[t.code];
                                                return (
                                                    <TableCell key={t.id} className="text-right" title={b ? `Hak ${b.allotted} · Terpakai ${b.used} · Pending ${b.pending}` : ''}>
                                                        <span className="font-medium">{b?.available ?? 0}</span>
                                                    </TableCell>
                                                );
                                            })}
                                            <TableCell className="text-right">
                                                <Can on="leave-admin-balances" do="edit">
                                                    <Button variant="ghost" size="icon" title="Koreksi saldo" onClick={() => openAdjust(r)}>
                                                        <SlidersHorizontal className="size-4" />
                                                    </Button>
                                                </Can>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Pagination links={rows.links} />
            </div>

            <Dialog open={adjust !== null} onOpenChange={(o) => !o && setAdjust(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Koreksi Saldo — {adjust?.row.name}</DialogTitle></DialogHeader>
                    <div className="grid gap-3">
                        <div className="grid gap-2">
                            <Label>Jenis Cuti</Label>
                            <Select value={form.data.leave_type_id} onValueChange={(v) => form.setData('leave_type_id', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{types.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="delta">Penyesuaian (hari, boleh minus)</Label>
                            <Input id="delta" type="number" step="0.5" value={form.data.delta} onChange={(e) => form.setData('delta', e.target.value)} placeholder="mis. 2 atau -1" />
                        </div>
                        <DialogFooter>
                            <Button onClick={submitAdjust} disabled={form.processing || form.data.delta === ''}>Simpan Koreksi</Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
