<?php

namespace App\Models;

use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeaveBalance extends Model
{
    use Auditable;

    protected $fillable = [
        'employee_id', 'leave_type_id', 'year',
        'allotted', 'carried_over', 'used', 'pending', 'adjustment',
    ];

    protected function casts(): array
    {
        return [
            'year' => 'integer',
            'allotted' => 'decimal:1',
            'carried_over' => 'decimal:1',
            'used' => 'decimal:1',
            'pending' => 'decimal:1',
            'adjustment' => 'decimal:1',
        ];
    }

    /** Sisa saldo yang benar-benar bisa dipakai. */
    protected function available(): Attribute
    {
        return Attribute::make(
            get: fn () => (float) $this->allotted + (float) $this->carried_over + (float) $this->adjustment
                - (float) $this->used - (float) $this->pending,
        );
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function leaveType(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class);
    }
}
