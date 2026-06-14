<?php

namespace App\Models;

use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OvertimeEntry extends Model
{
    use Auditable;

    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'overtime_period_id', 'date', 'activity', 'start_time', 'end_time', 'hours',
        'is_holiday', 'status', 'note', 'decided_by', 'decided_at',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'hours' => 'decimal:2',
            'is_holiday' => 'boolean',
            'decided_at' => 'datetime',
        ];
    }

    public function period(): BelongsTo
    {
        return $this->belongsTo(OvertimePeriod::class, 'overtime_period_id');
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'decided_by');
    }
}
