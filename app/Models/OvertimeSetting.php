<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OvertimeSetting extends Model
{
    protected $fillable = ['rate_per_hour', 'multiplier_workday', 'multiplier_holiday'];

    protected function casts(): array
    {
        return [
            'rate_per_hour' => 'decimal:2',
            'multiplier_workday' => 'decimal:2',
            'multiplier_holiday' => 'decimal:2',
        ];
    }

    /** The single settings row (created with defaults on first access). */
    public static function current(): self
    {
        return static::query()->firstOrCreate([], ['rate_per_hour' => 0, 'multiplier_workday' => 1, 'multiplier_holiday' => 2]);
    }
}
