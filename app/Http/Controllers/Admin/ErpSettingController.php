<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ErpSetting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class ErpSettingController extends Controller
{
    public function settings(): Response
    {
        $s = ErpSetting::current();

        return Inertia::render('erp/settings', [
            'settings' => [
                'host' => $s->host,
                'port' => $s->port,
                'database' => $s->database,
                'username' => $s->username,
                'prefix' => $s->prefix,
                'entities' => $s->entities,
                'base_url' => $s->base_url,
                'is_active' => $s->is_active,
                'has_password' => filled($s->password),
            ],
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'host' => ['required', 'string', 'max:255'],
            'port' => ['nullable', 'string', 'max:10'],
            'database' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'max:255'],
            'prefix' => ['nullable', 'string', 'max:50'],
            'entities' => ['nullable', 'string', 'max:50'],
            'base_url' => ['nullable', 'string', 'max:255'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $s = ErpSetting::current();
        $s->host = $data['host'];
        $s->port = $data['port'] ?: '3306';
        $s->database = $data['database'];
        $s->username = $data['username'];
        $s->prefix = $data['prefix'] ?: 'llxjp_';
        $s->entities = $data['entities'] ?: '1';
        $s->base_url = $data['base_url'] ?: null;
        $s->is_active = (bool) ($data['is_active'] ?? false);
        // Blank password = keep existing.
        if (filled($data['password'] ?? null)) {
            $s->password = $data['password'];
        }
        $s->save();

        return back()->with('success', 'Pengaturan ERP berhasil disimpan.'.($s->is_active ? ' Koneksi DB override aktif.' : ''));
    }

    /** Test the saved ERP settings against a throwaway connection. */
    public function test(): RedirectResponse
    {
        $s = ErpSetting::current();

        config(['database.connections.erp_test' => array_merge(config('database.connections.erp'), [
            'host' => $s->host,
            'port' => $s->port ?: '3306',
            'database' => $s->database,
            'username' => $s->username,
            'password' => $s->password,
        ])]);
        DB::purge('erp_test');

        try {
            $conn = DB::connection('erp_test');
            $conn->select('select 1');
            // Probe the product table with the configured prefix (proves prefix is right too).
            $cnt = $conn->table(($s->prefix ?: 'llxjp_').'product')->count();

            return back()->with('success', "Koneksi ERP OK — {$s->database}@{$s->host} ({$cnt} produk terbaca).");
        } catch (Throwable $e) {
            return back()->with('error', 'Gagal konek ERP: '.$e->getMessage());
        } finally {
            DB::purge('erp_test');
        }
    }
}
