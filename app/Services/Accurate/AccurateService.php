<?php

namespace App\Services\Accurate;

use App\Models\AccurateSetting;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class AccurateService
{
    /** Base HTTP client (honours the SSL-verify config for local dev). */
    protected function http(): PendingRequest
    {
        $options = ['verify' => config('accurate.verify_ssl', true)];
        if ($proxy = config('accurate.proxy')) {
            $options['proxy'] = $proxy;
        }

        return Http::withOptions($options)->acceptJson()->timeout(30);
    }

    /**
     * Headers required by every Accurate /api/*.do call: bearer token + the
     * request signature (HMAC-SHA256 of the timestamp using the Signature Secret).
     *
     * @return array<string, string>
     */
    protected function apiHeaders(AccurateSetting $s, string $token): array
    {
        $timestamp = now()->format('d/m/Y H:i:s');
        $signature = base64_encode(hash_hmac('sha256', $timestamp, (string) $s->signature_secret, true));

        return [
            'Authorization' => 'Bearer '.$token,
            'X-Api-Timestamp' => $timestamp,
            'X-Api-Signature' => $signature,
        ];
    }

    /** Fixed OAuth callback URL — must be registered in the Accurate app exactly. */
    public function callbackUrl(): string
    {
        return route('accurate.callback');
    }

    /** Build the Accurate authorization URL to redirect the user to. */
    public function authorizeUrl(AccurateSetting $s): string
    {
        $params = http_build_query([
            'client_id' => $s->client_id,
            'response_type' => 'code',
            'redirect_uri' => $this->callbackUrl(),
            'scope' => $s->scope ?: '',
        ]);

        return rtrim($s->base_url, '/').'/oauth/authorize?'.$params;
    }

    /**
     * Exchange an authorization code for access + refresh tokens.
     *
     * @return array{ok: bool, message: string}
     */
    public function exchangeCode(AccurateSetting $s, string $code): array
    {
        try {
            $resp = $this->http()->asForm()
                ->withBasicAuth($s->client_id, $s->client_secret)
                ->post(rtrim($s->base_url, '/').'/oauth/token', [
                    'grant_type' => 'authorization_code',
                    'code' => $code,
                    'redirect_uri' => $this->callbackUrl(),
                ]);

            $j = $resp->json();

            if ($resp->successful() && ! empty($j['access_token'])) {
                $s->access_token = $j['access_token'];
                $s->refresh_token = $j['refresh_token'] ?? $s->refresh_token;
                $s->token_expires_at = now()->addSeconds((int) ($j['expires_in'] ?? 0));
                $s->is_active = true;
                $s->save();

                return ['ok' => true, 'message' => 'Berhasil terhubung ke Accurate.'];
            }

            Log::warning('Accurate token exchange failed', ['status' => $resp->status(), 'body' => $resp->body(), 'redirect_uri' => $this->callbackUrl()]);

            return ['ok' => false, 'message' => 'Gagal menukar code: '.($j['error_description'] ?? $j['error'] ?? $resp->body())];
        } catch (Throwable $e) {
            return ['ok' => false, 'message' => 'Gagal menukar code: '.$e->getMessage()];
        }
    }

    /** Refresh the access token using the refresh token. Returns true on success. */
    public function refresh(AccurateSetting $s): bool
    {
        if (blank($s->refresh_token)) {
            return false;
        }

        try {
            $resp = $this->http()->asForm()
                ->withBasicAuth($s->client_id, $s->client_secret)
                ->post(rtrim($s->base_url, '/').'/oauth/token', [
                    'grant_type' => 'refresh_token',
                    'refresh_token' => $s->refresh_token,
                ]);

            $j = $resp->json();
            if ($resp->successful() && ! empty($j['access_token'])) {
                $s->access_token = $j['access_token'];
                $s->refresh_token = $j['refresh_token'] ?? $s->refresh_token;
                $s->token_expires_at = now()->addSeconds((int) ($j['expires_in'] ?? 0));
                $s->save();

                return true;
            }
        } catch (Throwable) {
            // fall through
        }

        return false;
    }

    /** Return a non-expired access token, refreshing first if needed. */
    public function freshToken(AccurateSetting $s): ?string
    {
        if (blank($s->access_token)) {
            return null;
        }

        if ($s->token_expires_at && $s->token_expires_at->isPast()) {
            $this->refresh($s);
        }

        return $s->access_token;
    }

    /**
     * List the Accurate databases available to the token.
     *
     * @return array{ok: bool, message: string, data: array<int, array<string, mixed>>}
     */
    public function listDatabases(AccurateSetting $s): array
    {
        $token = $this->freshToken($s);
        if (! $token) {
            return ['ok' => false, 'message' => 'Belum terhubung. Klik "Hubungkan ke Accurate" dulu.', 'data' => []];
        }
        if (blank($s->signature_secret)) {
            return ['ok' => false, 'message' => 'Signature Secret belum diisi di Setting.', 'data' => []];
        }

        try {
            $resp = $this->http()->withHeaders($this->apiHeaders($s, $token))
                ->get(rtrim($s->base_url, '/').'/api/db-list.do');

            $j = $resp->json();
            if ($resp->successful() && ($j['s'] ?? false) === true) {
                return ['ok' => true, 'message' => 'OK', 'data' => is_array($j['d'] ?? null) ? $j['d'] : []];
            }

            $reason = is_array($j['d'] ?? null) ? implode(', ', $j['d']) : ($j['d'] ?? 'token tidak valid');

            return ['ok' => false, 'message' => 'Gagal: '.$reason, 'data' => []];
        } catch (Throwable $e) {
            return ['ok' => false, 'message' => 'Tidak bisa menghubungi Accurate: '.$e->getMessage(), 'data' => []];
        }
    }

    /**
     * Open a database to obtain the session host + id (needed for data API calls).
     *
     * @return array{ok: bool, message: string}
     */
    public function openDatabase(AccurateSetting $s, string $databaseId): array
    {
        $token = $this->freshToken($s);
        if (! $token) {
            return ['ok' => false, 'message' => 'Belum terhubung.'];
        }

        try {
            $resp = $this->http()->withHeaders($this->apiHeaders($s, $token))
                ->get(rtrim($s->base_url, '/').'/api/open-db.do', ['id' => $databaseId]);

            $j = $resp->json();
            if ($resp->successful() && ($j['s'] ?? false) === true) {
                // Accurate's open-db returns host + session at the TOP LEVEL ("d" is just a
                // success message). Fall back to other shapes defensively.
                $d = $j['d'] ?? null;
                $host = $j['host']
                    ?? (is_array($d) ? ($d['host'] ?? null) : null)
                    ?? (is_array($d) && isset($d[0]) && is_string($d[0]) && str_starts_with($d[0], 'http') ? $d[0] : null)
                    ?? (is_string($d) && str_starts_with($d, 'http') ? $d : null);
                $session = $j['session'] ?? (is_array($d) ? ($d['session'] ?? null) : null);

                if (blank($host) || blank($session)) {
                    Log::warning('Accurate open-db unexpected shape', ['body' => $resp->body()]);

                    return ['ok' => false, 'message' => 'Database dibuka tapi host/session tidak terbaca. Cek log. Respons: '.\Illuminate\Support\Str::limit($resp->body(), 300)];
                }

                $s->database_id = $databaseId;
                $s->api_host = rtrim($host, '/');
                $s->session_id = $session;
                $s->save();

                return ['ok' => true, 'message' => 'Database dibuka. Host & session tersimpan.'];
            }

            $reason = is_array($j['d'] ?? null) ? implode(', ', $j['d']) : ($j['d'] ?? 'gagal membuka database');

            // Session-included API token: open-db isn't needed. Just set the data host.
            if (str_contains(strtolower($reason), 'sesi database') || str_contains(strtolower($reason), 'tidak perlu')) {
                $s->database_id = $databaseId;
                if (blank($s->api_host)) {
                    $s->api_host = 'https://public.accurate.id';
                }
                $s->save();

                return ['ok' => true, 'message' => 'Token sudah termasuk sesi database — API Host di-set ke '.$s->api_host.'. Tidak perlu open-db.'];
            }

            return ['ok' => false, 'message' => 'Gagal: '.$reason];
        } catch (Throwable $e) {
            return ['ok' => false, 'message' => 'Tidak bisa menghubungi Accurate: '.$e->getMessage()];
        }
    }

    /**
     * Fetch sales invoices for a date range (dates in dd/MM/yyyy).
     *
     * @return array{ok: bool, message: string, rows: array<int, array<string, mixed>>, meta: array<string, mixed>}
     */
    public function salesInvoices(AccurateSetting $s, string $from, string $to, int $page = 1, int $pageSize = 100): array
    {
        $token = $this->freshToken($s);
        if (! $token) {
            return ['ok' => false, 'message' => 'Belum terhubung.', 'rows' => [], 'meta' => []];
        }
        if (blank($s->signature_secret)) {
            return ['ok' => false, 'message' => 'Signature Secret belum diisi.', 'rows' => [], 'meta' => []];
        }
        if (blank($s->api_host)) {
            return ['ok' => false, 'message' => 'API Host belum diisi (mis. https://public.accurate.id).', 'rows' => [], 'meta' => []];
        }

        try {
            // Session-included API tokens don't need X-Session-ID; only send it when present.
            $headers = $this->apiHeaders($s, $token);
            if (filled($s->session_id)) {
                $headers['X-Session-ID'] = $s->session_id;
            }

            $resp = $this->http()
                ->withHeaders($headers)
                ->get(rtrim($s->api_host, '/').'/accurate/api/sales-invoice/list.do', [
                    'sp.page' => $page,
                    'sp.pageSize' => $pageSize,
                    'filter.transDate.op' => 'BETWEEN',
                    'filter.transDate.val[0]' => $from,
                    'filter.transDate.val[1]' => $to,
                    'fields' => 'id,number,transDate,totalAmount,statusName,customer',
                ]);

            $j = $resp->json();

            if ($resp->successful() && ($j['s'] ?? false) === true) {
                $rows = collect(is_array($j['d'] ?? null) ? $j['d'] : [])->map(fn ($r) => [
                    'id' => $r['id'] ?? null,
                    'number' => $r['number'] ?? null,
                    'transDate' => $r['transDate'] ?? null,
                    'customer' => is_array($r['customer'] ?? null) ? ($r['customer']['name'] ?? null) : ($r['customerName'] ?? ($r['customer'] ?? null)),
                    'total' => $r['totalAmount'] ?? 0,
                    'status' => $r['statusName'] ?? null,
                ])->all();

                $sp = $j['sp'] ?? [];

                return ['ok' => true, 'message' => 'OK', 'rows' => $rows, 'meta' => [
                    'page' => $sp['page'] ?? $page,
                    'pageCount' => $sp['pageCount'] ?? 1,
                    'rowCount' => $sp['rowCount'] ?? count($rows),
                ]];
            }

            $reason = is_array($j['d'] ?? null) ? implode(', ', $j['d']) : ($j['d'] ?? 'gagal mengambil data');

            return ['ok' => false, 'message' => 'Gagal: '.$reason, 'rows' => [], 'meta' => []];
        } catch (Throwable $e) {
            return ['ok' => false, 'message' => 'Tidak bisa menghubungi Accurate: '.$e->getMessage(), 'rows' => [], 'meta' => []];
        }
    }

    /**
     * Fetch one sales invoice with its line items (item, qty, price, discount, tax).
     *
     * @return array{ok: bool, message: string, header?: array<string, mixed>, lines?: array<int, array<string, mixed>>}
     */
    public function salesInvoiceDetail(AccurateSetting $s, int $id): array
    {
        $token = $this->freshToken($s);
        if (! $token) {
            return ['ok' => false, 'message' => 'Belum terhubung.'];
        }
        if (blank($s->api_host)) {
            return ['ok' => false, 'message' => 'API Host belum diisi.'];
        }

        try {
            $headers = $this->apiHeaders($s, $token);
            if (filled($s->session_id)) {
                $headers['X-Session-ID'] = $s->session_id;
            }

            $resp = $this->http()->withHeaders($headers)
                ->get(rtrim($s->api_host, '/').'/accurate/api/sales-invoice/detail.do', ['id' => $id]);

            $j = $resp->json();

            if (! ($resp->successful() && ($j['s'] ?? false) === true)) {
                $reason = is_array($j['d'] ?? null) ? implode(', ', $j['d']) : ($j['d'] ?? 'gagal mengambil detail');

                return ['ok' => false, 'message' => 'Gagal: '.$reason];
            }

            $d = $j['d'];

            $lines = collect($d['detailItem'] ?? [])->map(fn ($r) => [
                'item_no' => is_array($r['item'] ?? null) ? ($r['item']['no'] ?? null) : null,
                'item_name' => $r['detailName'] ?? (is_array($r['item'] ?? null) ? ($r['item']['name'] ?? null) : null),
                'qty' => $r['quantity'] ?? 0,
                'unit' => is_array($r['itemUnit'] ?? null) ? ($r['itemUnit']['name'] ?? null) : ($r['availableItemUnitName'] ?? null),
                'unit_price' => $r['unitPrice'] ?? 0,
                'gross' => $r['grossAmount'] ?? 0,
                'disc_percent' => $r['itemDiscPercent'] ?: 0,
                'disc_amount' => $r['itemCashDiscount'] ?? 0,
                'dpp' => $r['dppAmount'] ?? 0,
                'ppn' => $r['tax1Amount'] ?? 0,
                'tax_name' => $r['detailTaxName'] ?? null,
                'total' => $r['totalPrice'] ?? 0,
            ])->all();

            return [
                'ok' => true,
                'message' => 'OK',
                'header' => [
                    'number' => $d['number'] ?? null,
                    'po_number' => $d['poNumber'] ?? null,
                    'customer' => is_array($d['customer'] ?? null) ? ($d['customer']['name'] ?? null) : ($d['retailWpName'] ?? null),
                    'status' => $d['statusName'] ?? null,
                    'trans_date' => $d['transDate'] ?? ($d['transDateView'] ?? null),
                    'dpp' => $d['taxableAmount1'] ?? 0,
                    'ppn' => $d['tax1Amount'] ?? 0,
                    'total' => $d['totalAmount'] ?? 0,
                ],
                'lines' => $lines,
            ];
        } catch (Throwable $e) {
            return ['ok' => false, 'message' => 'Tidak bisa menghubungi Accurate: '.$e->getMessage()];
        }
    }

    /**
     * Quick connection test (db-list).
     *
     * @return array{ok: bool, message: string}
     */
    public function testConnection(): array
    {
        $r = $this->listDatabases(AccurateSetting::current());
        if ($r['ok']) {
            return ['ok' => true, 'message' => 'Terhubung ke Accurate. '.count($r['data']).' database terbaca.'];
        }

        return ['ok' => false, 'message' => $r['message']];
    }
}
