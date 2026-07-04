<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PricingSubmission extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_PARTIAL = 'partial';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
            'decided_at' => 'datetime',
        ];
    }

    public function principal(): BelongsTo
    {
        return $this->belongsTo(PricingPrincipal::class, 'principal_id');
    }

    public function profile(): BelongsTo
    {
        return $this->belongsTo(PricingProfile::class, 'profile_id');
    }

    public function hospital(): BelongsTo
    {
        return $this->belongsTo(PricingHospital::class, 'hospital_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(PricingSubmissionItem::class, 'submission_id');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(PricingSubmissionAttachment::class, 'submission_id');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }
}
