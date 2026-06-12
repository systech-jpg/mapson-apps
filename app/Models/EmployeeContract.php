<?php

namespace App\Models;

use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmployeeContract extends Model
{
    use Auditable, SoftDeletes;

    protected $fillable = [
        'employee_id', 'contract_type', 'number', 'start_date', 'end_date', 'is_current', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return ['is_current' => 'boolean'];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
