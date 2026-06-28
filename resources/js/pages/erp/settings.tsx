import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { LoaderCircle, Plug, Save } from 'lucide-react';
import { type FormEventHandler } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integrasi Data', href: '#' },
    { title: 'ERP', href: '#' },
    { title: 'Setting', href: '/integration/erp/settings' },
];

interface Settings {
    host: string | null;
    port: string | null;
    database: string | null;
    username: string | null;
    prefix: string | null;
    entities: string | null;
    base_url: string | null;
    is_active: boolean;
    has_password: boolean;
}

export default function ErpSettings({ settings }: { settings: Settings }) {
    const { data, setData, put, processing, errors } = useForm({
        host: settings.host ?? '',
        port: settings.port ?? '3306',
        database: settings.database ?? '',
        username: settings.username ?? '',
        password: '',
        prefix: settings.prefix ?? 'llxjp_',
        entities: settings.entities ?? '1',
        base_url: settings.base_url ?? '',
        is_active: settings.is_active,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        put(route('erp.settings.update'), { preserveScroll: true });
    };
    const test = () => router.post(route('erp.test'), {}, { preserveScroll: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="ERP — Setting" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">Setting Koneksi ERP</h1>
                    <p className="text-sm text-muted-foreground">
                        Koneksi database ERP (Dolibarr, MySQL). Bila <b>Aktifkan</b> dicentang, pengaturan ini menggantikan nilai di <code>.env</code> saat runtime.
                    </p>
                </div>

                <form onSubmit={submit} className="grid max-w-3xl gap-4">
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-base">Database</CardTitle></CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="host">Host *</Label>
                                <Input id="host" value={data.host} onChange={(e) => setData('host', e.target.value)} placeholder="127.0.0.1" />
                                <InputError message={errors.host} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="port">Port</Label>
                                <Input id="port" value={data.port} onChange={(e) => setData('port', e.target.value)} placeholder="3306" />
                                <InputError message={errors.port} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="database">Database *</Label>
                                <Input id="database" value={data.database} onChange={(e) => setData('database', e.target.value)} placeholder="mapsonerpdb" />
                                <InputError message={errors.database} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="username">Username *</Label>
                                <Input id="username" value={data.username} onChange={(e) => setData('username', e.target.value)} autoComplete="off" />
                                <InputError message={errors.username} />
                            </div>
                            <div className="grid gap-1.5 sm:col-span-2">
                                <Label htmlFor="password">Password {settings.has_password && <span className="text-xs text-muted-foreground">(tersimpan — kosongkan jika tidak diubah)</span>}</Label>
                                <Input id="password" type="password" value={data.password} onChange={(e) => setData('password', e.target.value)} placeholder={settings.has_password ? '••••••••' : ''} autoComplete="new-password" />
                                <InputError message={errors.password} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-base">Parameter ERP</CardTitle></CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="prefix">Prefix Tabel</Label>
                                <Input id="prefix" value={data.prefix} onChange={(e) => setData('prefix', e.target.value)} placeholder="llxjp_" />
                                <InputError message={errors.prefix} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="entities">Entities</Label>
                                <Input id="entities" value={data.entities} onChange={(e) => setData('entities', e.target.value)} placeholder="1" />
                                <InputError message={errors.entities} />
                            </div>
                            <div className="grid gap-1.5 sm:col-span-2">
                                <Label htmlFor="base_url">Base URL (untuk link "Buka di ERP")</Label>
                                <Input id="base_url" value={data.base_url} onChange={(e) => setData('base_url', e.target.value)} placeholder="https://erp.contoh.com" />
                                <InputError message={errors.base_url} />
                            </div>
                            <label className="flex items-center gap-2 text-sm sm:col-span-2">
                                <Checkbox checked={data.is_active} onCheckedChange={(v) => setData('is_active', v === true)} />
                                Aktifkan (override koneksi <code>.env</code> dengan pengaturan ini)
                            </label>
                        </CardContent>
                    </Card>

                    <div className="flex gap-2">
                        <Button type="submit" disabled={processing}>
                            {processing ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Simpan
                        </Button>
                        <Button type="button" variant="outline" onClick={test}>
                            <Plug className="size-4" /> Test Koneksi
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Tips: <b>Simpan</b> dulu, lalu <b>Test Koneksi</b> (menguji nilai tersimpan). Kalau OK, centang <b>Aktifkan</b> & Simpan.
                    </p>
                </form>
            </div>
        </AppLayout>
    );
}
