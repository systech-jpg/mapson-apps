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
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type Lookup } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { Building2, Maximize2, Pencil, Plus, Users } from 'lucide-react';
import { type FormEventHandler, useMemo, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Organizational Units', href: '/org-units' }];
const NONE = 'none';
const TYPES = ['division', 'directorate', 'department', 'section', 'team'];

const TYPE_BADGE: Record<string, string> = {
    directorate: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    division: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    department: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    section: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    team: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

interface OrgUnitRow {
    id: number;
    company_id: number | null;
    parent_id: number | null;
    code: string | null;
    name: string;
    type: string;
    cost_center_id: number | null;
    sort_order: number;
    is_active: boolean;
    company?: Lookup | null;
    parent?: Lookup | null;
    manager?: { id: number; full_name: string } | null;
}

interface TreeNode extends OrgUnitRow {
    children: TreeNode[];
}

interface Props {
    orgUnits: OrgUnitRow[];
    companies: Lookup[];
    costCenters: Lookup[];
    headcounts: Record<string, number>;
}

function buildTree(units: OrgUnitRow[]): TreeNode[] {
    const map = new Map<number, TreeNode>();
    units.forEach((u) => map.set(u.id, { ...u, children: [] }));
    const roots: TreeNode[] = [];
    map.forEach((n) => {
        if (n.parent_id && map.has(n.parent_id)) {
            map.get(n.parent_id)!.children.push(n);
        } else {
            roots.push(n);
        }
    });
    return roots;
}

function flatten(nodes: TreeNode[], level = 0, out: Array<TreeNode & { level: number }> = []): Array<TreeNode & { level: number }> {
    nodes.forEach((n) => {
        out.push({ ...n, level });
        flatten(n.children, level + 1, out);
    });
    return out;
}

export default function OrgUnitsIndex({ orgUnits, companies, costCenters, headcounts }: Props) {
    const [open, setOpen] = useState(false);
    const [zoomOpen, setZoomOpen] = useState(false);
    const [editing, setEditing] = useState<OrgUnitRow | null>(null);
    const { can } = usePermissions();

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        company_id: '' as string,
        parent_id: '' as string,
        code: '',
        name: '',
        type: 'department',
        cost_center_id: '' as string,
        sort_order: 0,
        is_active: true as boolean,
    });

    const tree = useMemo(() => buildTree(orgUnits), [orgUnits]);
    const flatRows = useMemo(() => flatten(tree), [tree]);

    // Group chart roots per company (units without company go under "Tanpa Company").
    const chartGroups = useMemo(() => {
        const groups = new Map<string, { company: string; roots: TreeNode[] }>();
        tree.forEach((root) => {
            const key = root.company?.name ?? 'Tanpa Company';
            if (!groups.has(key)) {
                groups.set(key, { company: key, roots: [] });
            }
            groups.get(key)!.roots.push(root);
        });
        return [...groups.values()];
    }, [tree]);

    const openCreate = (parent?: OrgUnitRow) => {
        reset();
        clearErrors();
        setEditing(null);
        if (parent) {
            setData((d) => ({
                ...d,
                parent_id: String(parent.id),
                company_id: parent.company_id ? String(parent.company_id) : '',
            }));
        }
        setOpen(true);
    };

    const openEdit = (o: OrgUnitRow) => {
        clearErrors();
        setEditing(o);
        setData({
            company_id: o.company_id ? String(o.company_id) : '',
            parent_id: o.parent_id ? String(o.parent_id) : '',
            code: o.code ?? '',
            name: o.name,
            type: o.type,
            cost_center_id: o.cost_center_id ? String(o.cost_center_id) : '',
            sort_order: o.sort_order,
            is_active: o.is_active,
        });
        setOpen(true);
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const opts = { onSuccess: () => setOpen(false) };
        editing ? put(route('org-units.update', editing.id), opts) : post(route('org-units.store'), opts);
    };

    const parentOptions = orgUnits.filter((o) => !editing || o.id !== editing.id);

    const ChartNode = ({ node, compact }: { node: TreeNode; compact?: boolean }) => {
        const count = headcounts[node.id] ?? 0;
        return (
            <li>
                <div
                    className={`group relative inline-block rounded-md border bg-card text-center shadow-sm transition-colors ${
                        compact ? 'max-w-28 min-w-20 px-1.5 py-1' : 'min-w-36 rounded-lg px-3 py-2'
                    } ${node.is_active ? '' : 'opacity-50'} ${can('org-units', 'edit') ? 'cursor-pointer hover:border-primary/50' : ''}`}
                    onClick={() => can('org-units', 'edit') && openEdit(node)}
                    title={`${node.name}${node.code ? ` (${node.code})` : ''} — ${node.type}${count ? ` · ${count} karyawan` : ''}${node.is_active ? '' : ' · Nonaktif'}`}
                >
                    <div className={`leading-tight font-medium ${compact ? 'text-[11px]' : 'text-sm'}`}>{node.name}</div>
                    <div className={`flex items-center justify-center gap-1.5 ${compact ? 'mt-0.5' : 'mt-1'}`}>
                        {!compact && node.code && <span className="text-[10px] text-muted-foreground">{node.code}</span>}
                        <span className={`rounded px-1 py-px font-medium capitalize ${compact ? 'text-[9px]' : 'px-1.5 text-[10px]'} ${TYPE_BADGE[node.type] ?? TYPE_BADGE.team}`}>{node.type}</span>
                        {count > 0 && (
                            <span className={`flex items-center gap-0.5 text-muted-foreground ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
                                <Users className={compact ? 'size-2.5' : 'size-3'} /> {count}
                            </span>
                        )}
                    </div>
                    {!compact && node.manager && <div className="mt-0.5 text-[10px] text-muted-foreground">{node.manager.full_name}</div>}
                    {can('org-units', 'create') && (
                        <button
                            type="button"
                            className="absolute -right-2 -bottom-2 hidden size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm group-hover:flex hover:text-foreground"
                            title="Tambah unit di bawahnya"
                            onClick={(e) => {
                                e.stopPropagation();
                                openCreate(node);
                            }}
                        >
                            <Plus className="size-3" />
                        </button>
                    )}
                </div>
                {node.children.length > 0 && (
                    <ul>
                        {node.children.map((c) => (
                            <ChartNode key={c.id} node={c} compact={compact} />
                        ))}
                    </ul>
                )}
            </li>
        );
    };

    const ChartGroups = ({ compact }: { compact?: boolean }) =>
        chartGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Belum ada unit. Klik "Tambah Unit" untuk mulai.</p>
        ) : (
            <div className={`overflow-x-auto pb-1 ${compact ? 'space-y-4' : 'space-y-8'}`}>
                {chartGroups.map((g) => (
                    <div key={g.company} className={`org-tree mx-auto min-w-max ${compact ? 'compact' : ''}`}>
                        <ul>
                            <li>
                                <div
                                    className={`inline-flex flex-col items-center rounded-lg border-2 border-primary/30 bg-primary/5 text-center shadow-sm ${
                                        compact ? 'min-w-32 px-3 py-1' : 'min-w-44 px-4 py-2'
                                    }`}
                                >
                                    <Building2 className={`text-primary ${compact ? 'mb-0.5 size-3' : 'mb-1 size-4'}`} />
                                    <span className={`font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>{g.company}</span>
                                </div>
                                <ul>
                                    {g.roots.map((r) => (
                                        <ChartNode key={r.id} node={r} compact={compact} />
                                    ))}
                                </ul>
                            </li>
                        </ul>
                    </div>
                ))}
            </div>
        );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Organizational Units" />
            {/* Classic CSS org-chart connectors */}
            <style>{`
                .org-tree ul { display: flex; justify-content: center; padding-top: 1.25rem; position: relative; }
                .org-tree li { display: flex; flex-direction: column; align-items: center; position: relative; padding: 1.25rem 0.5rem 0; list-style: none; }
                .org-tree li::before, .org-tree li::after { content: ''; position: absolute; top: 0; right: 50%; width: 50%; height: 1.25rem; border-top: 1px solid var(--border); }
                .org-tree li::after { right: auto; left: 50%; border-left: 1px solid var(--border); }
                .org-tree li:only-child::before, .org-tree li:only-child::after { display: none; }
                .org-tree li:only-child { padding-top: 0; }
                .org-tree li:first-child::before, .org-tree li:last-child::after { border: 0 none; }
                .org-tree li:last-child::before { border-right: 1px solid var(--border); border-radius: 0 0.375rem 0 0; }
                .org-tree li:first-child::after { border-radius: 0.375rem 0 0 0; }
                .org-tree ul ul::before { content: ''; position: absolute; top: 0; left: 50%; width: 0; height: 1.25rem; border-left: 1px solid var(--border); }
                .org-tree > ul { padding-top: 0; }
                .org-tree > ul > li { padding-top: 0; }
                .org-tree.compact ul { padding-top: 0.75rem; }
                .org-tree.compact li { padding: 0.75rem 0.125rem 0; }
                .org-tree.compact li::before, .org-tree.compact li::after { height: 0.75rem; }
                .org-tree.compact ul ul::before { height: 0.75rem; }
                .org-tree.compact > ul, .org-tree.compact > ul > li { padding-top: 0; }
            `}</style>
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold">Organizational Units</h1>
                        <p className="text-sm text-muted-foreground">Struktur organisasi (divisi, departemen, dst) dalam satu hierarki.</p>
                    </div>
                    <Can on="org-units" do="create">
                        <Button onClick={() => openCreate()}>
                            <Plus className="size-4" /> Tambah Unit
                        </Button>
                    </Can>
                </div>

                {/* 1. Organization chart (compact) */}
                <Card className="gap-2 py-4">
                    <CardHeader className="flex flex-row items-center justify-between py-0">
                        <CardTitle className="text-sm">Struktur Organisasi</CardTitle>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setZoomOpen(true)}>
                            <Maximize2 className="size-3.5" /> Perbesar
                        </Button>
                    </CardHeader>
                    <CardContent className="py-0">
                        <ChartGroups compact />
                    </CardContent>
                </Card>

                {/* 2. Data table (hierarchical order, compact) */}
                <Card className="gap-2 py-4">
                    <CardHeader className="py-0">
                        <CardTitle className="text-sm">Data Unit</CardTitle>
                    </CardHeader>
                    <CardContent className="py-0">
                        <Table className="text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:h-8 [&_th]:px-2">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Kode</TableHead>
                                    <TableHead>Nama</TableHead>
                                    <TableHead>Tipe</TableHead>
                                    <TableHead>Manager</TableHead>
                                    <TableHead className="text-right">Kary.</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {flatRows.map((o) => (
                                    <TableRow key={o.id}>
                                        <TableCell className="text-muted-foreground">{o.code ?? '-'}</TableCell>
                                        <TableCell className="font-medium">
                                            <span style={{ paddingLeft: `${o.level * 1}rem` }}>
                                                {o.level > 0 && <span className="mr-1 text-muted-foreground">└</span>}
                                                {o.name}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${TYPE_BADGE[o.type] ?? TYPE_BADGE.team}`}>{o.type}</span>
                                        </TableCell>
                                        <TableCell>{o.manager?.full_name ?? '-'}</TableCell>
                                        <TableCell className="text-right">{headcounts[o.id] ?? 0}</TableCell>
                                        <TableCell>
                                            <Badge variant={o.is_active ? 'default' : 'secondary'} className="px-1.5 py-0 text-[10px]">{o.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end">
                                                <Can on="org-units" do="edit">
                                                    <Button variant="ghost" size="icon" className="size-6" onClick={() => openEdit(o)}>
                                                        <Pencil className="size-3.5" />
                                                    </Button>
                                                </Can>
                                                <Can on="org-units" do="delete">
                                                    <ConfirmDelete url={route('org-units.destroy', o.id)} title={`Hapus unit ${o.name}?`} />
                                                </Can>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            {/* Zoom modal: full-size chart */}
            <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
                <DialogContent className="max-h-[92vh] w-[96vw] max-w-7xl overflow-auto">
                    <DialogHeader>
                        <DialogTitle>Struktur Organisasi</DialogTitle>
                    </DialogHeader>
                    <ChartGroups />
                    <p className="text-xs text-muted-foreground">Klik kotak untuk mengubah unit; arahkan kursor lalu klik tombol + untuk menambah unit di bawahnya.</p>
                </DialogContent>
            </Dialog>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Ubah Unit' : 'Tambah Unit'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="code">Kode</Label>
                                <Input id="code" value={data.code} onChange={(e) => setData('code', e.target.value)} />
                                <InputError message={errors.code} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="name">Nama</Label>
                                <Input id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} required />
                                <InputError message={errors.name} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="type">Tipe</Label>
                                <Select value={data.type} onValueChange={(v) => setData('type', v)}>
                                    <SelectTrigger id="type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TYPES.map((t) => (
                                            <SelectItem key={t} value={t} className="capitalize">
                                                {t}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="parent_id">Parent</Label>
                                <Select value={data.parent_id || NONE} onValueChange={(v) => setData('parent_id', v === NONE ? '' : v)}>
                                    <SelectTrigger id="parent_id">
                                        <SelectValue placeholder="Tanpa parent" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>- Tanpa parent -</SelectItem>
                                        {parentOptions.map((o) => (
                                            <SelectItem key={o.id} value={String(o.id)}>
                                                {o.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <InputError message={errors.parent_id} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="company_id">Company</Label>
                                <Select value={data.company_id || NONE} onValueChange={(v) => setData('company_id', v === NONE ? '' : v)}>
                                    <SelectTrigger id="company_id">
                                        <SelectValue placeholder="Pilih company" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>- Tidak ada -</SelectItem>
                                        {companies.map((c) => (
                                            <SelectItem key={c.id} value={String(c.id)}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="cost_center_id">Cost Center</Label>
                                <Select value={data.cost_center_id || NONE} onValueChange={(v) => setData('cost_center_id', v === NONE ? '' : v)}>
                                    <SelectTrigger id="cost_center_id">
                                        <SelectValue placeholder="Pilih cost center" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>- Tidak ada -</SelectItem>
                                        {costCenters.map((c) => (
                                            <SelectItem key={c.id} value={String(c.id)}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="grid gap-2">
                                <Label htmlFor="sort_order">Urutan</Label>
                                <Input id="sort_order" type="number" className="w-24" value={data.sort_order} onChange={(e) => setData('sort_order', Number(e.target.value))} />
                            </div>
                            <div className="flex items-center gap-3 pt-6">
                                <Switch id="is_active" checked={data.is_active} onCheckedChange={(v) => setData('is_active', v)} />
                                <Label htmlFor="is_active">Aktif</Label>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={processing}>
                                Simpan
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
