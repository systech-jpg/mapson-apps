import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { CheckCircle2, LoaderCircle, Plug, XCircle } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integrasi Data', href: '#' },
    { title: 'Hadirr', href: '#' },
    { title: 'Setting', href: '/integration/hadirr/settings' },
];

interface Settings {
    base_url: string;
    is_active: boolean;
    connected: boolean;
    token_expires_at: string | null;
    has_access_key: boolean;
    has_secret_key: boolean;
    has_auth_encoded: boolean;
}

export default function HadirrSettings({ settings }: { settings: Settings }) {
    const [testing, setTesting] = useState(false);

    const { data, setData, put, processing, errors } = useForm({
        base_url: settings.base_url ?? 'https://developer.hadirr.com/v0',
        access_key: '',
        secret_key: '',
        auth_encoded: '',
        is_active: settings.is_active as boolean,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        put(route('hadirr.settings.update'), { preserveScroll: true });
    };

    const testConnection = () => {
        setTesting(true);
        router.post(route('hadirr.test'), {}, { preserveScroll: true, onFinish: () => setTesting(false) });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Hadirr — Setting" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold">Integrasi Hadirr</h1>
                        <p className="text-sm text-muted-foreground">
                            Koneksi API Hadirr (absensi). Akses key &amp; secret key dari akun Hadirr Anda —{' '}
                            <a href="https://developer.hadirr.com/" target="_blank" rel="noreferrer" className="underline">dokumentasi</a>.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {settings.connected ? (
                            <Badge className="gap-1"><CheckCircle2 className="size-3.5" /> Terhubung</Badge>
                        ) : (
                            <Badge variant="secondary" className="gap-1"><XCircle className="size-3.5" /> Belum terhubung</Badge>
                        )}
                        <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
                            {testing ? <LoaderCircle className="size-4 animate-spin" /> : <Plug className="size-4" />}
                            Test Koneksi
                        </Button>
                    </div>
                </div>

                <form onSubmit={submit} className="grid gap-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Kredensial API</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="base_url">Base URL</Label>
                                <Input id="base_url" value={data.base_url} onChange={(e) => setData('base_url', e.target.value)} placeholder="https://developer.hadirr.com/v0" />
                                <InputError message={errors.base_url} />
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="access_key">Access Key</Label>
                                    <Input id="access_key" type="password" value={data.access_key} onChange={(e) => setData('access_key', e.target.value)} placeholder={settings.has_access_key ? '•••••• (terisi — kosongkan jika tidak diubah)' : 'Belum diisi'} />
                                    <InputError message={errors.access_key} />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="secret_key">Secret Key</Label>
                                    <Input id="secret_key" type="password" value={data.secret_key} onChange={(e) => setData('secret_key', e.target.value)} placeholder={settings.has_secret_key ? '•••••• (terisi — kosongkan jika tidak diubah)' : 'Belum diisi'} />
                                    <InputError message={errors.secret_key} />
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Cukup isi Access Key &amp; Secret Key — aplikasi yang meng-encode &amp; menambah <code>bearer</code> otomatis saat memanggil <code>/auth</code>. Tidak perlu menempel token bearer.
                            </p>

                            <div className="grid gap-2">
                                <Label htmlFor="auth_encoded">Kode Encode (opsional)</Label>
                                <Input id="auth_encoded" type="password" value={data.auth_encoded} onChange={(e) => setData('auth_encoded', e.target.value)} placeholder={settings.has_auth_encoded ? '•••••• (terisi — kosongkan jika tidak diubah)' : 'Hanya jika kamu sudah punya string ter-encode (seperti di Postman)'} />
                                <InputError message={errors.auth_encoded} />
                                <span className="text-xs text-muted-foreground">Tempel string "Hasil Encode" (tanpa kata "bearer"). Jika diisi, ini dipakai menggantikan Access/Secret Key.</span>
                            </div>

                            <div className="flex items-center gap-3">
                                <Switch id="is_active" checked={data.is_active} onCheckedChange={(v) => setData('is_active', v)} />
                                <Label htmlFor="is_active">Aktifkan integrasi Hadirr</Label>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex items-center gap-3">
                        <Button type="submit" disabled={processing}>
                            {processing && <LoaderCircle className="size-4 animate-spin" />} Simpan
                        </Button>
                        <span className="text-xs text-muted-foreground">Field rahasia dikosongkan = nilai lama dipertahankan.</span>
                    </div>
                </form>

                <Card>
                    <CardHeader>
                        <CardTitle>Koneksi</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        {settings.connected ? (
                            <p>Token aktif{settings.token_expires_at ? ` — berlaku s/d ${settings.token_expires_at}` : ''}. Klik <b>Test Koneksi</b> untuk memverifikasi ulang.</p>
                        ) : (
                            <p>Isi Access Key &amp; Secret Key, klik <b>Simpan</b>, lalu <b>Test Koneksi</b>. Token JWT diambil otomatis dari <code>/auth</code> dan disimpan terenkripsi.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
