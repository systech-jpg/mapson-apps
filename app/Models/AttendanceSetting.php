<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceSetting extends Model
{
    protected $fillable = ['deadline', 'full_day_after'];

    /** The single settings row (created with defaults on first access). */
    public static function current(): self
    {
        return static::query()->firstOrCreate([], ['deadline' => '09:00', 'full_day_after' => '12:00']);
    }
}
