<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendCaseFee extends Model
{
    protected $fillable = ['tier', 'label', 'fee'];

    protected function casts(): array
    {
        return ['fee' => 'decimal:2'];
    }

    /** @return array<int, float> tier => fee */
    public static function feeMap(): array
    {
        return static::query()->pluck('fee', 'tier')->map(fn ($f) => (float) $f)->all();
    }
}
