<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PricingSubmissionItem extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['pricelist' => 'decimal:2'];
    }

    public function submission(): BelongsTo
    {
        return $this->belongsTo(PricingSubmission::class, 'submission_id');
    }

    public function price(): BelongsTo
    {
        return $this->belongsTo(PricingProductPrice::class, 'price_id');
    }
}
