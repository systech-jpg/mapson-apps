<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    use HasUuids;

    protected $fillable = [
        'sku_code', 'product_name', 'principal_name', 'erp_ref',
        'currency_code', 'base_price_valas', 'principal_disc_pct', 'bm_nominal', 'tax_nominal',
        'import_fee_nominal', 'opex_pct', 'profit_pct', 'comm_pct', 'ship_sales_pct', 'final_price',
    ];

    protected function casts(): array
    {
        return [
            'base_price_valas' => 'decimal:2',
            'principal_disc_pct' => 'decimal:2',
            'bm_nominal' => 'decimal:2',
            'tax_nominal' => 'decimal:2',
            'import_fee_nominal' => 'decimal:2',
            'opex_pct' => 'decimal:2',
            'profit_pct' => 'decimal:2',
            'comm_pct' => 'decimal:2',
            'ship_sales_pct' => 'decimal:2',
            'final_price' => 'decimal:2',
        ];
    }

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class, 'currency_code', 'code');
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(PricingApproval::class);
    }

    public function pendingApproval(): HasMany
    {
        return $this->hasMany(PricingApproval::class)->where('status', 'pending');
    }
}
