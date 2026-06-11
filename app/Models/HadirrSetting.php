<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HadirrSetting extends Model
{
    protected $fillable = [
        'base_url', 'access_key', 'secret_key', 'auth_encoded', 'access_token', 'token_expires_at', 'is_active',
    ];

    public function isConnected(): bool
    {
        return filled($this->access_token) && $this->token_expires_at && $this->token_expires_at->isFuture();
    }

    protected function casts(): array
    {
        return [
            // Credentials are stored encrypted at rest.
            'access_key' => 'encrypted',
            'secret_key' => 'encrypted',
            'auth_encoded' => 'encrypted',
            'access_token' => 'encrypted',
            'token_expires_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }

    /** The single settings row (created on first access). */
    public static function current(): self
    {
        return static::query()->firstOrCreate([], ['base_url' => 'https://developer.hadirr.com/v0']);
    }
}
