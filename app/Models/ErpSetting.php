<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ErpSetting extends Model
{
    protected $fillable = [
        'host', 'port', 'database', 'username', 'password', 'prefix', 'entities', 'base_url', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'password' => 'encrypted',   // stored encrypted at rest
            'is_active' => 'boolean',
        ];
    }

    /** Single settings row, seeded from .env defaults on first access. */
    public static function current(): self
    {
        return static::query()->firstOrCreate([], [
            'host' => env('ERP_DB_HOST', '127.0.0.1'),
            'port' => env('ERP_DB_PORT', '3306'),
            'database' => env('ERP_DB_DATABASE', 'mapsonerpdb'),
            'username' => env('ERP_DB_USERNAME', 'root'),
            'password' => env('ERP_DB_PASSWORD', 'root'),
            'prefix' => env('ERP_DB_PREFIX', 'llxjp_'),
            'entities' => env('ERP_ENTITIES', '1'),
            'base_url' => env('ERP_BASE_URL', ''),
            'is_active' => false,
        ]);
    }

    /** Apply this row to the live 'erp' connection + erp.* config, then reconnect. */
    public function applyToConfig(): void
    {
        config([
            'database.connections.erp.host' => $this->host,
            'database.connections.erp.port' => $this->port,
            'database.connections.erp.database' => $this->database,
            'database.connections.erp.username' => $this->username,
            'database.connections.erp.password' => $this->password,
            'erp.prefix' => $this->prefix ?: 'llxjp_',
            'erp.entities' => $this->entities ?: '1',
            'erp.base_url' => $this->base_url ?: '',
        ]);

        \Illuminate\Support\Facades\DB::purge('erp');
    }
}
