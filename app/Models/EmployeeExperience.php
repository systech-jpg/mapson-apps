<?php

namespace App\Models;

use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmployeeExperience extends Model
{
    use Auditable, SoftDeletes;

    protected $fillable = ['employee_id', 'company_name', 'position', 'start_date', 'end_date', 'description', 'last_salary'];

    protected function casts(): array
    {
        return ['start_date' => 'date', 'end_date' => 'date', 'last_salary' => 'decimal:2'];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
