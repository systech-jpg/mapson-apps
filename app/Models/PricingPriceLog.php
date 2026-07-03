<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PricingPriceLog extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'changes' => 'array',
            'pricelist_before' => 'decimal:2',
            'pricelist_after' => 'decimal:2',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function profile(): BelongsTo
    {
        return $this->belongsTo(PricingProfile::class, 'profile_id');
    }
}
