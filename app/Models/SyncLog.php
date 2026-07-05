<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SyncLog extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * Record one sync run. $result may be an int (row count) or an array of counts; a best-effort
     * total is derived for the `rows` column and the raw result is kept in `summary`.
     */
    public static function record(string $channel, string $source, string $status, mixed $result = null, ?string $message = null, ?int $durationMs = null, string $trigger = 'manual', ?int $userId = null): void
    {
        $rows = null;
        $summary = null;
        if (is_int($result) || is_float($result)) {
            $rows = (int) $result;
            $summary = (string) $result;
        } elseif (is_array($result)) {
            $rows = (int) collect($result)->filter(fn ($v) => is_int($v) || is_float($v))->sum();
            $summary = json_encode($result, JSON_UNESCAPED_UNICODE);
        } elseif ($result !== null) {
            $summary = (string) $result;
        }

        static::create([
            'channel' => $channel,
            'source' => $source,
            'status' => $status,
            'rows' => $rows,
            'summary' => $summary,
            'message' => $message,
            'duration_ms' => $durationMs,
            'trigger' => $trigger,
            'user_id' => $userId,
            'created_at' => now(),
        ]);
    }
}
