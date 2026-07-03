<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PricingPrincipal extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'erp_societe_id' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function products(): HasMany
    {
        return $this->hasMany(PricingProduct::class, 'principal_id');
    }
}
