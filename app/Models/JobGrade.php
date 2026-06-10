<?php

namespace App\Models;

use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class JobGrade extends Model
{
    use Auditable, SoftDeletes;

    protected $fillable = ['code', 'name', 'level', 'min_salary', 'max_salary', 'is_active'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'level' => 'integer',
            'min_salary' => 'decimal:2',
            'max_salary' => 'decimal:2',
        ];
    }

    public function jobs(): HasMany
    {
        return $this->hasMany(Job::class);
    }
}
