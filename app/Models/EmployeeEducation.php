<?php

namespace App\Models;

use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmployeeEducation extends Model
{
    use Auditable, SoftDeletes;

    protected $table = 'employee_educations';

    protected $fillable = ['employee_id', 'level', 'institution', 'major', 'start_year', 'end_year', 'gpa', 'is_highest'];

    protected function casts(): array
    {
        return ['is_highest' => 'boolean', 'start_year' => 'integer', 'end_year' => 'integer', 'gpa' => 'decimal:2'];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
