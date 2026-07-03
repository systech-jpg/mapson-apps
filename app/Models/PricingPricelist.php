<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PricingPricelist extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'pricelist' => 'decimal:2',
            'breakdown' => 'array',
            'effective_from' => 'date:Y-m-d',
            'effective_to' => 'date:Y-m-d',
            'is_active' => 'boolean',
            'approved_at' => 'datetime',
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

    public function submission(): BelongsTo
    {
        return $this->belongsTo(PricingSubmission::class, 'submission_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
