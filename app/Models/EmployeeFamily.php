<?php

namespace App\Models;

use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmployeeFamily extends Model
{
    use Auditable, SoftDeletes;

    protected $fillable = ['employee_id', 'name', 'relationship', 'gender', 'birth_date', 'nik', 'is_dependent', 'occupation'];

    protected function casts(): array
    {
        return ['birth_date' => 'date', 'is_dependent' => 'boolean'];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
