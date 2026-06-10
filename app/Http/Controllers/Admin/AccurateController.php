<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateAccurateSettingRequest;
use App\Models\AccurateSetting;
use App\Services\Accurate\AccurateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AccurateController extends Controller
{
    public function __construct(protected AccurateService $accurate)
    {
    }

    public function settings(): Response
    {
        $s = AccurateSetting::current();

        return Inertia::render('accurate/settings', [
            'settings' => [
                'base_url' => $s->base_url,
                'client_id' => $s->client_id,
                'scope' => $s->scope,
                'database_id' => $s->database_id,
                'api_host' => $s->api_host,
                'is_active' => $s->is_active,
                'connected' => $s->isConnected(),
                'token_expires_at' => $s->token_expires_at?->format('d M Y H:i'),
                'has_client_secret' => filled($s->client_secret),
                'has_signature_secret' => filled($s->signature_secret),
                'has_access_token' => filled($s->access_token),
                'has_refresh_token' => filled($s->refresh_token),
                'has_session_id' => filled($s->session_id),
                'redirect_uri' => $this->accurate->callbackUrl(),
            ],
        ]);
    }

    public function update(UpdateAccurateSettingRequest $request): RedirectResponse
    {
        $s = AccurateSetting::current();
        $data = $request->validated();

        $s->base_url = $data['base_url'];
        $s->client_id = $data['client_id'] ?? null;
        $s->scope = $data['scope'] ?? null;
        $s->is_active = $data['is_active'] ?? false;

        // Non-secret fields: only touch when the form actually sends them
        // (so the OAuth/open-db flow doesn't get wiped by the credential form).
        if (array_key_exists('api_host', $data)) {
            $s->api_host = $data['api_host'] ?: null;
        }
        if (array_key_exists('database_id', $data)) {
            $s->database_id = $data['database_id'] ?: null;
        }

        // Secrets: only overwrite when a new value is typed (blank = keep existing).
        foreach (['client_secret', 'signature_secret', 'access_token', 'refresh_token', 'session_id'] as $secret) {
            if (filled($data[$secret] ?? null)) {
                $s->{$secret} = $data[$secret];
            }
        }

        // Manually pasting a token counts as connected/active.
        if (filled($data['access_token'] ?? null)) {
            $s->is_active = true;
        }

        $s->save();

        return back()->with('success', 'Pengaturan Accurate berhasil disimpan.');
    }

    /** Step 1: redirect the user to Accurate to authorize. */
    public function connect(): RedirectResponse
    {
        $s = AccurateSetting::current();

        if (blank($s->client_id) || blank($s->client_secret)) {
            return back()->with('error', 'Lengkapi Client ID & Client Secret lalu Simpan dulu.');
        }

        return redirect()->away($this->accurate->authorizeUrl($s));
    }

    /** Step 2: Accurate redirects back here with ?code=... */
    public function callback(Request $request): RedirectResponse
    {
        if ($error = $request->string('error')->toString()) {
            return to_route('accurate.settings')->with('error', 'Accurate menolak otorisasi: '.$error);
        }

        $code = $request->string('code')->toString();
        if (blank($code)) {
            return to_route('accurate.settings')->with('error', 'Authorization code tidak diterima dari Accurate.');
        }

        $result = $this->accurate->exchangeCode(AccurateSetting::current(), $code);

        return to_route('accurate.settings')->with($result['ok'] ? 'success' : 'error', $result['message']);
    }

    /** List databases (for the picker), loaded on demand. */
    public function databases(): JsonResponse
    {
        return response()->json($this->accurate->listDatabases(AccurateSetting::current()));
    }

    /** Open a database to capture host + session. */
    public function openDb(Request $request): RedirectResponse
    {
        $request->validate(['database_id' => ['required', 'string']]);

        $result = $this->accurate->openDatabase(AccurateSetting::current(), $request->string('database_id')->toString());

        return back()->with($result['ok'] ? 'success' : 'error', $result['message']);
    }

    public function disconnect(): RedirectResponse
    {
        AccurateSetting::current()->update([
            'access_token' => null,
            'refresh_token' => null,
            'token_expires_at' => null,
            'session_id' => null,
            'api_host' => null,
            'is_active' => false,
        ]);

        return back()->with('success', 'Koneksi Accurate diputuskan.');
    }

    public function test(): RedirectResponse
    {
        $result = $this->accurate->testConnection();

        return back()->with($result['ok'] ? 'success' : 'error', $result['message']);
    }

    /** Sales page (pick a period, then fetch). */
    public function salesPage(): Response
    {
        $s = AccurateSetting::current();

        return Inertia::render('accurate/sales', [
            // Session is optional (API tokens include the session); only token + host are required.
            'ready' => $s->isConnected() && filled($s->api_host),
            'status' => [
                'token' => $s->isConnected(),
                'host' => filled($s->api_host),
                'session' => filled($s->session_id),
            ],
        ]);
    }

    /** Fetch sales invoices for a period (JSON, loaded on demand). */
    public function salesData(Request $request): JsonResponse
    {
        $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $from = \Illuminate\Support\Carbon::parse($request->input('from'))->format('d/m/Y');
        $to = \Illuminate\Support\Carbon::parse($request->input('to'))->format('d/m/Y');

        return response()->json(
            $this->accurate->salesInvoices(AccurateSetting::current(), $from, $to, $request->integer('page', 1))
        );
    }

    /** Fetch one invoice's line-item detail (JSON, on demand). */
    public function salesDetail(int $id): JsonResponse
    {
        return response()->json(
            $this->accurate->salesInvoiceDetail(AccurateSetting::current(), $id)
        );
    }
}
