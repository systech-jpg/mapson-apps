<?php

namespace App\Models;

use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class LeaveRequest extends Model
{
    use Auditable, SoftDeletes;

    /** Status lifecycle (lihat state machine). */
    public const STATUS_DRAFT = 'draft';

    public const STATUS_PENDING_SUPERVISOR = 'pending_supervisor';

    public const STATUS_PENDING_MANAGER = 'pending_manager';

    public const STATUS_PENDING_HR = 'pending_hr';

    public const STATUS_PENDING_DIRECTOR = 'pending_director';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_WITHDRAWN = 'withdrawn';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_EXPIRED = 'expired';

    /** Status yang masih menunggu keputusan (saldo di-hold). */
    public const PENDING_STATUSES = [
        self::STATUS_PENDING_SUPERVISOR,
        self::STATUS_PENDING_MANAGER,
        self::STATUS_PENDING_HR,
        self::STATUS_PENDING_DIRECTOR,
    ];

    protected $fillable = [
        'request_number', 'employee_id', 'leave_type_id', 'start_date', 'end_date',
        'day_part', 'total_days', 'start_time', 'end_time', 'year', 'reason',
        'status', 'current_level', 'submitted_at', 'decided_at', 'decision_note', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'total_days' => 'decimal:1',
            'year' => 'integer',
            'current_level' => 'integer',
            'submitted_at' => 'datetime',
            'decided_at' => 'datetime',
        ];
    }

    public function isPending(): bool
    {
        return in_array($this->status, self::PENDING_STATUSES, true);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function leaveType(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class);
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(LeaveApproval::class)->orderBy('level');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(LeaveAttachment::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
