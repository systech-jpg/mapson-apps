<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OvertimeApproval extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_SKIPPED = 'skipped';

    protected $fillable = [
        'overtime_period_id', 'level', 'role', 'approver_employee_id', 'status', 'notes', 'acted_at',
    ];

    protected function casts(): array
    {
        return ['acted_at' => 'datetime'];
    }

    public function period(): BelongsTo
    {
        return $this->belongsTo(OvertimePeriod::class, 'overtime_period_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'approver_employee_id');
    }
}
