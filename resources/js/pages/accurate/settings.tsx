import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { CheckCircle2, LoaderCircle, Plug, XCircle } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integrasi Data', href: '#' },
    { title: 'Accurate', href: '#' },
    { title: 'Setting', href: '/integration/accurate/settings' },
];

interface Settings {
    base_url: string;
    client_id: string | null;
    scope: string | null;
    database_id: string | null;
    api_host: string | null;
    is_active: boolean;
    connected: boolean;
    token_expires_at: string | null;
    has_client_secret: boolean;
    has_signature_secret: boolean;
    has_access_token: boolean;
    has_session_id: boolean;
    redirect_uri: string;
}

interface AccurateDb {
    id: number | string;
    alias?: string;
    name?: string;
}

export default function AccurateSettings({ settings }: { settings: Settings }) {
    const [testing, setTesting] = useState(false);
    const [dbs, setDbs] = useState<AccurateDb[] | null>(null);
    const [loadingDbs, setLoadingDbs] = useState(false);
    const [selectedDb, setSelectedDb] = useState(settings.database_id ?? '');

    const { data, setData, put, processing, errors } = useForm({
        base_url: settings.base_url ?? 'https://account.accurate.id',
        client_id: settings.client_id ?? '',
        client_secret: '',
        signature_secret: '',
        scope: settings.scope ?? '',
        is_active: settings.is_active as boolean,
        access_token: '',
        api_host: settings.api_host ?? '',
        session_id: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        put(route('accurate.settings.update'), { preserveScroll: true });
    };

    const testConnection = () => {
        setTesting(true);
        router.post(route('accurate.test'), {}, { preserveScroll: true, onFinish: () => setTesting(false) });
    };

    const loadDatabases = () => {
        setLoadingDbs(true);
        fetch(route('accurate.databases'), { headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
            .then((r) => r.json())
            .then((j) => setDbs(j.ok ? (j.data ?? []) : []))
            .catch(() => setDbs([]))
            .finally(() => setLoadingDbs(false));
    };

    const openDatabase = () => {
        if (!selectedDb) return;
        router.post(route('accurate.open-db'), { database_id: selectedDb }, { preserveScroll: true });
    };

    const disconnect = () => router.post(route('accurate.disconnect'), {}, { preserveScroll: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Accurate — Setting" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">Accurate — Setting</h1>
                        <p className="text-sm text-muted-foreground">Hubungkan aplikasi ke Accurate Online via OAuth.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {settings.connected ? (
                            <Badge className="gap-1"><CheckCircle2 className="size-3.5" /> Terhubung</Badge>
                        ) : (
                            <Badge variant="secondary" className="gap-1"><XCircle className="size-3.5" /> Belum terhubung</Badge>
                        )}
                        <Button variant="outline" size="sm" onClick={testConnection} disabled={testing || !settings.connected}>
                            {testing ? <LoaderCircle className="size-4 animate-spin" /> : <Plug className="size-4" />}
                            Test Koneksi
                        </Button>
                    </div>
                </div>

                {/* 1. Kredensial */}
                <form onSubmit={submit} className="grid gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">1. Kredensial OAuth</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="grid gap-2">
                                <Label>Redirect URI (daftarkan persis ini di aplikasi Accurate)</Label>
                                <Input readOnly value={settings.redirect_uri} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="base_url">Base URL *</Label>
                                    <Input id="base_url" value={data.base_url} onChange={(e) => setData('base_url', e.target.value)} required />
                                    <InputError message={errors.base_url} />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="client_id">Client ID</Label>
                                    <Input id="client_id" value={data.client_id} onChange={(e) => setData('client_id', e.target.value)} />
                                </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="client_secret">Client Secret</Label>
                                    <Input id="client_secret" type="password" value={data.client_secret} onChange={(e) => setData('client_secret', e.target.value)} placeholder={settings.has_client_secret ? '•••••• (terisi — kosongkan jika tidak diubah)' : 'Belum diisi'} />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="signature_secret">Signature Secret</Label>
                                    <Input id="signature_secret" type="password" value={data.signature_secret} onChange={(e) => setData('signature_secret', e.target.value)} placeholder={settings.has_signature_secret ? '•••••• (terisi — kosongkan jika tidak diubah)' : 'Wajib untuk panggil API'} />
                                </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="scope">Scope</Label>
                                    <Input id="scope" value={data.scope} onChange={(e) => setData('scope', e.target.value)} placeholder="mis. item_view sales_invoice_view ..." />
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Switch id="is_active" checked={data.is_active} onCheckedChange={(v) => setData('is_active', v)} />
                                <Label htmlFor="is_active">Aktifkan integrasi Accurate</Label>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Token Manual (opsional)</CardTitle>
                            <p className="text-xs text-muted-foreground">
                                Kalau sudah punya Access Token sendiri, tempel di sini lalu Simpan — tanpa perlu klik "Hubungkan ke Accurate".
                            </p>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="access_token">Access Token</Label>
                                <Input id="access_token" type="password" value={data.access_token} onChange={(e) => setData('access_token', e.target.value)} placeholder={settings.has_access_token ? '•••••• (terisi — kosongkan jika tidak diubah)' : 'Belum diisi'} />
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="api_host">API Host (untuk tarik data)</Label>
                                    <Input id="api_host" value={data.api_host} onChange={(e) => setData('api_host', e.target.value)} placeholder="mis. https://public.accurate.id" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="session_id">Session ID</Label>
                                    <Input id="session_id" type="password" value={data.session_id} onChange={(e) => setData('session_id', e.target.value)} placeholder={settings.has_session_id ? '•••••• (terisi)' : 'Opsional'} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div>
                        <Button type="submit" disabled={processing}>Simpan</Button>
                        <span className="ml-3 text-xs text-muted-foreground">Field rahasia dikosongkan = nilai lama dipertahankan.</span>
                    </div>
                </form>

                {/* 2. Koneksi */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">2. Koneksi</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                        {!settings.connected ? (
                            <div className="flex flex-wrap items-center gap-3">
                                <Button asChild>
                                    <a href={route('accurate.connect')}><Plug className="size-4" /> Hubungkan ke Accurate</a>
                                </Button>
                                <span className="text-xs text-muted-foreground">Anda akan diarahkan ke Accurate untuk login & memberi izin.</span>
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center gap-4 text-sm">
                                    <span className="text-muted-foreground">
                                        Token berlaku s/d <b>{settings.token_expires_at ?? '—'}</b>
                                    </span>
                                    <Button variant="outline" size="sm" onClick={disconnect}>Putuskan</Button>
                                </div>

                                <div className="border-t pt-4">
                                    <Label className="mb-2 block">Pilih Database Accurate</Label>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button type="button" variant="outline" size="sm" onClick={loadDatabases} disabled={loadingDbs}>
                                            {loadingDbs && <LoaderCircle className="size-4 animate-spin" />} Muat Database
                                        </Button>
                                        {dbs && (
                                            <Select value={selectedDb} onValueChange={setSelectedDb}>
                                                <SelectTrigger className="w-72"><SelectValue placeholder="Pilih database" /></SelectTrigger>
                                                <SelectContent>
                                                    {dbs.length === 0 && <SelectItem value="none" disabled>Tidak ada / gagal memuat</SelectItem>}
                                                    {dbs.map((d) => (
                                                        <SelectItem key={String(d.id)} value={String(d.id)}>
                                                            {d.alias ?? d.name ?? `DB ${d.id}`}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                        <Button type="button" size="sm" onClick={openDatabase} disabled={!selectedDb}>Buka Database</Button>
                                    </div>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        Status sesi: {settings.api_host ? <>host <b>{settings.api_host}</b>, session {settings.has_session_id ? 'tersimpan' : 'belum'}</> : 'belum membuka database'}
                                    </p>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
