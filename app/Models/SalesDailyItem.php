<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesDailyItem extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'price' => 'float',
            'qty' => 'float',
            'disc_pct' => 'float',
            'total' => 'float',
        ];
    }

    public function entry(): BelongsTo
    {
        return $this->belongsTo(SalesDailyEntry::class, 'entry_id');
    }
}
