<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeaveHoliday extends Model
{
    protected $fillable = ['date', 'name', 'type', 'is_workday_override'];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'is_workday_override' => 'boolean',
        ];
    }
}
