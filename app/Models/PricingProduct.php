<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PricingProduct extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'price_principle' => 'decimal:2',
            'disc_principle_pct' => 'decimal:3',
            'kurs' => 'decimal:2',
            'qty_beli' => 'decimal:2',
            'qty_jual' => 'decimal:2',
            'bm_pct' => 'decimal:3',
            'pph22_pct' => 'decimal:3',
            'ppn_pct' => 'decimal:3',
            'shipment_pct' => 'decimal:3',
        ];
    }

    public function principal(): BelongsTo
    {
        return $this->belongsTo(PricingPrincipal::class, 'principal_id');
    }

    public function prices(): HasMany
    {
        return $this->hasMany(PricingProductPrice::class, 'product_id');
    }

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class, 'currency_code', 'code');
    }
}
