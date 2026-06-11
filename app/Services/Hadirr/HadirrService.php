<?php

namespace App\Services\Hadirr;

use App\Models\HadirrSetting;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class HadirrService
{
    /** Base HTTP client (honours SSL-verify / proxy config). */
    protected function http(): PendingRequest
    {
        $options = ['verify' => config('hadirr.verify_ssl', true)];
        if ($proxy = config('hadirr.proxy')) {
            $options['proxy'] = $proxy;
        }

        return Http::withOptions($options)->acceptJson()->timeout(30);
    }

    protected function base(HadirrSetting $s): string
    {
        return rtrim($s->base_url ?: 'https://developer.hadirr.com/v0', '/');
    }

    /**
     * Exchange access/secret key for a JWT. Hadirr expects the credentials
     * base64-encoded in the header: `Authorization: bearer <base64(access:secret)>`,
     * and returns the JWT in the response `data`. Caches the token on the row.
     *
     * The exact encode format isn't documented, so we try the common variants
     * and keep the first that yields a token.
     */
    public function authenticate(HadirrSetting $s): ?string
    {
        // Either a ready-made encoded string, or access+secret keys we encode ourselves.
        if (blank($s->auth_encoded) && (blank($s->access_key) || blank($s->secret_key))) {
            return null;
        }

        $candidates = [];
        if (filled($s->auth_encoded)) {
            $candidates[] = trim($s->auth_encoded);
        }
        if (filled($s->access_key) && filled($s->secret_key)) {
            $candidates[] = base64_encode($s->access_key.':'.$s->secret_key);
            $candidates[] = base64_encode($s->secret_key.':'.$s->access_key);
            $candidates[] = base64_encode($s->access_key.$s->secret_key);
            $candidates[] = base64_encode((string) json_encode(['access_key' => $s->access_key, 'secret_key' => $s->secret_key]));
        }
        $candidates = array_unique($candidates);

        foreach ($candidates as $encoded) {
            try {
                $resp = $this->http()
                    ->withHeaders(['Authorization' => 'bearer '.$encoded])
                    ->post($this->base($s).'/auth');

                $token = $this->extractToken($resp->json() ?? []);

                if ($resp->successful() && filled($token)) {
                    $s->access_token = $token;
                    $s->token_expires_at = $this->jwtExpiry($token) ?? now()->addHours(12);
                    $s->save();

                    return $token;
                }
            } catch (Throwable $e) {
                Log::warning('Hadirr auth error', ['msg' => $e->getMessage()]);
            }
        }

        Log::warning('Hadirr auth: no token returned for any encode format. Cek format encode / kredensial.');

        return null;
    }

    /** Pull the JWT out of Hadirr's response (token usually sits in `data`). */
    protected function extractToken(array $j): ?string
    {
        $d = $j['data'] ?? null;
        if (is_string($d) && trim($d) !== '') {
            return $d;
        }
        if (is_array($d)) {
            return $d['token'] ?? $d['jwt'] ?? $d['access_token'] ?? null;
        }

        return $j['token'] ?? $j['jwt'] ?? $j['access_token'] ?? null;
    }

    /** Return a valid cached token or re-authenticate. */
    public function freshToken(HadirrSetting $s): ?string
    {
        if (filled($s->access_token) && $s->token_expires_at && $s->token_expires_at->isFuture()) {
            return $s->access_token;
        }

        return $this->authenticate($s);
    }

    /**
     * Verify connectivity: get a JWT, then hit GET /employees.
     *
     * @return array{ok: bool, message: string}
     */
    public function testConnection(): array
    {
        $s = HadirrSetting::current();

        if (blank($s->auth_encoded) && (blank($s->access_key) || blank($s->secret_key))) {
            return ['ok' => false, 'message' => 'Isi Access Key & Secret Key (atau Kode Encode) dulu lalu Simpan.'];
        }

        $token = $this->freshToken($s);
        if (! $token) {
            return ['ok' => false, 'message' => 'Gagal mendapatkan token dari /auth. Cek Access/Secret Key (lihat storage/logs).'];
        }

        try {
            $resp = $this->http()->withToken($token)->get($this->base($s).'/employees', ['limit' => 1]);

            if ($resp->successful()) {
                return ['ok' => true, 'message' => 'Terhubung ke Hadirr. Token didapat & /employees dapat diakses.'];
            }

            return ['ok' => false, 'message' => 'Token didapat tapi /employees gagal: HTTP '.$resp->status().' — '.substr($resp->body(), 0, 200)];
        } catch (Throwable $e) {
            return ['ok' => false, 'message' => 'Tidak bisa menghubungi Hadirr: '.$e->getMessage()];
        }
    }

    /** Read the `exp` claim from a JWT, if present. */
    protected function jwtExpiry(string $jwt): ?Carbon
    {
        $parts = explode('.', $jwt);
        if (count($parts) < 2) {
            return null;
        }

        $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);
        if (is_array($payload) && ! empty($payload['exp'])) {
            try {
                return Carbon::createFromTimestamp($payload['exp']);
            } catch (Throwable) {
                return null;
            }
        }

        return null;
    }
}
