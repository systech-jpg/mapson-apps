<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class RegulatoryRegistration extends Model
{
    use SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'issued_date' => 'date:Y-m-d',
            'expired_date' => 'date:Y-m-d',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(RegulatoryRegistrationItem::class, 'registration_id')->orderBy('sort_order');
    }
}
