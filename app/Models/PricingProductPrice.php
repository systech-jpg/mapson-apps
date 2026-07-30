<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PricingProductPrice extends Model
{
    public const STATUS_DRAFT = 'draft';

    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'ops_pct' => 'decimal:3',
            'profit_pct' => 'decimal:3',
            'komisi_pct' => 'decimal:3',
            'event_pct' => 'decimal:3',
            'lainnya_pct' => 'decimal:3',
            'buffer_pct' => 'decimal:3',
            'rounding_step' => 'integer',
            'locked_pricelist' => 'decimal:2',
            'lock_ops_pct' => 'boolean',
            'lock_profit_pct' => 'boolean',
            'lock_komisi_pct' => 'boolean',
            'lock_event_pct' => 'boolean',
            'lock_lainnya_pct' => 'boolean',
            'pricelist' => 'decimal:2',
            'breakdown' => 'array',
            'decided_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(PricingProduct::class, 'product_id');
    }

    public function profile(): BelongsTo
    {
        return $this->belongsTo(PricingProfile::class, 'profile_id');
    }

    public function hospital(): BelongsTo
    {
        return $this->belongsTo(PricingHospital::class, 'hospital_id');
    }

    public function submissionItems(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(PricingSubmissionItem::class, 'price_id');
    }
}
