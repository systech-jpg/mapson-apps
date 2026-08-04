<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PricingHospital extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'erp_societe_id' => 'integer',
            'is_active' => 'boolean',
            'synced_at' => 'datetime',
        ];
    }
}
