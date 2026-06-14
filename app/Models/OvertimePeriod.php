<?php

namespace App\Models;

use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class OvertimePeriod extends Model
{
    use Auditable, SoftDeletes;

    public const STATUS_DRAFT = 'draft';

    public const STATUS_PENDING_SUPERVISOR = 'pending_supervisor';

    public const STATUS_PENDING_HR = 'pending_hr';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    public const PENDING_STATUSES = [self::STATUS_PENDING_SUPERVISOR, self::STATUS_PENDING_HR];

    protected $fillable = [
        'request_number', 'employee_id', 'period', 'period_start', 'period_end', 'status', 'current_level',
        'total_hours', 'total_amount', 'rate_per_hour', 'multiplier_workday', 'multiplier_holiday',
        'submitted_at', 'decided_at', 'decision_note', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'total_hours' => 'decimal:2',
            'total_amount' => 'decimal:2',
            'rate_per_hour' => 'decimal:2',
            'multiplier_workday' => 'decimal:2',
            'multiplier_holiday' => 'decimal:2',
            'submitted_at' => 'datetime',
            'decided_at' => 'datetime',
        ];
    }

    public function isPending(): bool
    {
        return in_array($this->status, self::PENDING_STATUSES, true);
    }

    public function isEditable(): bool
    {
        return in_array($this->status, [self::STATUS_DRAFT, self::STATUS_REJECTED], true);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function entries(): HasMany
    {
        return $this->hasMany(OvertimeEntry::class)->orderBy('date')->orderBy('start_time');
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(OvertimeApproval::class)->orderBy('level');
    }
}
