<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class SalesDailyEntry extends Model
{
    use SoftDeletes;

    public const TYPES = ['tindakan', 'bhp', 'unit'];

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'entry_date' => 'date:Y-m-d',
            'ppn_pct' => 'float',
            'total_amount' => 'float',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(SalesDailyItem::class, 'entry_id')->orderBy('sort_order');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
