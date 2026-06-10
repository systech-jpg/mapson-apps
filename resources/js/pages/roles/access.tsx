import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Fragment, type ReactNode, useMemo, useState } from 'react';

type Action = 'can_view' | 'can_create' | 'can_edit' | 'can_delete';

interface AccessNode {
    id: number;
    key: string;
    title: string;
    is_module: boolean;
    children: AccessNode[];
}

interface Perm {
    can_view: boolean;
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
}

type PermState = Record<number, Perm>;

interface Props {
    role: { id: number; name: string; is_super: boolean };
    menuTree: AccessNode[];
    permissions: Record<number, Perm>;
}

const ACTIONS: { key: Action; label: string }[] = [
    { key: 'can_view', label: 'View' },
    { key: 'can_create', label: 'Create' },
    { key: 'can_edit', label: 'Edit' },
    { key: 'can_delete', label: 'Delete' },
];

const EMPTY: Perm = { can_view: false, can_create: false, can_edit: false, can_delete: false };

function collectLeaves(nodes: AccessNode[]): AccessNode[] {
    return nodes.flatMap((node) => (node.is_module ? collectLeaves(node.children) : [node]));
}

export default function RoleAccess({ role, menuTree, permissions }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Roles', href: '/roles' },
        { title: `Hak Akses: ${role.name}`, href: '#' },
    ];

    const leaves = useMemo(() => collectLeaves(menuTree), [menuTree]);

    const [state, setState] = useState<PermState>(() => {
        const initial: PermState = {};
        leaves.forEach((leaf) => {
            initial[leaf.id] = { ...EMPTY, ...(permissions[leaf.id] ?? {}) };
        });
        return initial;
    });
    const [processing, setProcessing] = useState(false);

    const update = (menuId: number, action: Action, value: boolean) => {
        setState((prev) => {
            const next = { ...prev[menuId], [action]: value };

            // Any action implies view; turning view off clears the row.
            if (action !== 'can_view' && value) {
                next.can_view = true;
            }
            if (action === 'can_view' && !value) {
                next.can_create = false;
                next.can_edit = false;
                next.can_delete = false;
            }

            return { ...prev, [menuId]: next };
        });
    };

    const setModuleAll = (module: AccessNode, fullAccess: boolean) => {
        const childLeaves = collectLeaves(module.children);
        setState((prev) => {
            const next = { ...prev };
            childLeaves.forEach((leaf) => {
                next[leaf.id] = fullAccess
                    ? { can_view: true, can_create: true, can_edit: true, can_delete: true }
                    : { ...EMPTY };
            });
            return next;
        });
    };

    const submit = () => {
        const payload = Object.entries(state).map(([menuId, perm]) => ({
            menu_id: Number(menuId),
            ...perm,
        }));

        setProcessing(true);
        router.put(route('roles.access.update', role.id), { permissions: payload }, { onFinish: () => setProcessing(false) });
    };

    const renderLeaf = (node: AccessNode, depth: number) => {
        const perm = state[node.id] ?? EMPTY;

        return (
            <tr key={node.id} className="border-b last:border-0">
                <td className="py-2" style={{ paddingLeft: depth * 20 }}>
                    {node.title}
                </td>
                {ACTIONS.map((action) => (
                    <td key={action.key} className="py-2 text-center">
                        <Checkbox checked={perm[action.key]} onCheckedChange={(v) => update(node.id, action.key, Boolean(v))} />
                    </td>
                ))}
            </tr>
        );
    };

    const renderModule = (node: AccessNode, depth: number): ReactNode => (
        <Fragment key={`mod-${node.id}`}>
            <tr className="border-b bg-muted/40">
                <td className="py-2 font-medium" style={{ paddingLeft: depth * 20 }}>
                    {node.title}
                </td>
                <td colSpan={4} className="py-2">
                    <div className="flex justify-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setModuleAll(node, true)}>
                            Pilih semua
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setModuleAll(node, false)}>
                            Kosongkan
                        </Button>
                    </div>
                </td>
            </tr>
            {node.children.map((child) => (child.is_module ? renderModule(child, depth + 1) : renderLeaf(child, depth + 1)))}
        </Fragment>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Hak Akses - ${role.name}`} />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold">Hak Akses Role</h1>
                        <p className="text-sm text-muted-foreground">{role.name}</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href={route('roles.index')}>Kembali</Link>
                        </Button>
                        <Button onClick={submit} disabled={processing}>
                            Simpan
                        </Button>
                    </div>
                </div>

                {role.is_super && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        Role ini adalah Super Admin dan otomatis memiliki akses penuh ke semua menu, terlepas dari pengaturan di bawah.
                    </div>
                )}

                <Card>
                    <CardContent className="pt-6">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left">
                                    <th className="py-2">Menu</th>
                                    {ACTIONS.map((a) => (
                                        <th key={a.key} className="w-24 py-2 text-center">
                                            {a.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>{menuTree.map((node) => (node.is_module ? renderModule(node, 0) : renderLeaf(node, 0)))}</tbody>
                        </table>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
