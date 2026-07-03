<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PricingProfile extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'rounding_step' => 'integer',
            'default_bm_pct' => 'decimal:3',
            'default_pph22_pct' => 'decimal:3',
            'default_ppn_pct' => 'decimal:3',
            'default_shipment_pct' => 'decimal:3',
            'default_ops_pct' => 'decimal:3',
            'default_profit_pct' => 'decimal:3',
            'default_komisi_pct' => 'decimal:3',
            'default_event_pct' => 'decimal:3',
            'default_lainnya_pct' => 'decimal:3',
            'default_buffer_pct' => 'decimal:3',
        ];
    }
}
