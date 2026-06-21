<?php

namespace App\Models;

use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class OvertimeEntry extends Model
{
    use Auditable;

    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'overtime_period_id', 'date', 'activity', 'start_time', 'end_time', 'hours', 'amount',
        'is_holiday', 'status', 'note', 'decided_by', 'decided_at',
    ];

    /** Expose exact duration (minutes) for H:MM display. */
    protected $appends = ['minutes'];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'hours' => 'decimal:2',
            'amount' => 'decimal:2',
            'is_holiday' => 'boolean',
            'decided_at' => 'datetime',
        ];
    }

    /** Exact minutes between start & end (handles crossing midnight). */
    protected function minutes(): Attribute
    {
        return Attribute::get(function () {
            if (! $this->start_time || ! $this->end_time) {
                return 0;
            }
            $s = Carbon::parse($this->start_time);
            $e = Carbon::parse($this->end_time);

            return (int) ($e->gt($s) ? $s->diffInMinutes($e) : $s->diffInMinutes($e->copy()->addDay()));
        });
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
