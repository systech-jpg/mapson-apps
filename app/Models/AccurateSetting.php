<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccurateSetting extends Model
{
    protected $fillable = [
        'base_url', 'client_id', 'client_secret', 'signature_secret', 'scope', 'access_token', 'refresh_token',
        'token_expires_at', 'database_id', 'api_host', 'session_id', 'is_active',
    ];

    public function isConnected(): bool
    {
        return filled($this->access_token);
    }

    protected function casts(): array
    {
        return [
            // Secrets are stored encrypted at rest.
            'client_secret' => 'encrypted',
            'signature_secret' => 'encrypted',
            'access_token' => 'encrypted',
            'refresh_token' => 'encrypted',
            'session_id' => 'encrypted',
            'token_expires_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }

    /**
     * The single settings row (created on first access).
     */
    public static function current(): self
    {
        return static::query()->firstOrCreate([], ['base_url' => 'https://account.accurate.id']);
    }
}
