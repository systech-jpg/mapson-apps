<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateHadirrSettingRequest;
use App\Models\HadirrSetting;
use App\Services\Hadirr\HadirrService;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class HadirrController extends Controller
{
    public function __construct(protected HadirrService $hadirr)
    {
    }

    public function settings(): Response
    {
        $s = HadirrSetting::current();

        return Inertia::render('hadirr/settings', [
            'settings' => [
                'base_url' => $s->base_url,
                'is_active' => $s->is_active,
                'connected' => $s->isConnected(),
                'token_expires_at' => $s->token_expires_at?->format('d M Y H:i'),
                'has_access_key' => filled($s->access_key),
                'has_secret_key' => filled($s->secret_key),
                'has_auth_encoded' => filled($s->auth_encoded),
            ],
        ]);
    }

    public function update(UpdateHadirrSettingRequest $request): RedirectResponse
    {
        $s = HadirrSetting::current();
        $data = $request->validated();

        $s->base_url = $data['base_url'];
        $s->is_active = $data['is_active'] ?? false;

        // Secrets: only overwrite when a new value is typed (blank = keep existing).
        $keysChanged = false;
        foreach (['access_key', 'secret_key', 'auth_encoded'] as $secret) {
            if (filled($data[$secret] ?? null)) {
                $s->{$secret} = $data[$secret];
                $keysChanged = true;
            }
        }

        // New credentials invalidate the cached token.
        if ($keysChanged) {
            $s->access_token = null;
            $s->token_expires_at = null;
        }

        $s->save();

        return back()->with('success', 'Pengaturan Hadirr berhasil disimpan.');
    }

    public function test(): RedirectResponse
    {
        $result = $this->hadirr->testConnection();

        return back()->with($result['ok'] ? 'success' : 'error', $result['message']);
    }
}
