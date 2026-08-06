<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RegulatoryRegistrationItem extends Model
{
    protected $guarded = ['id'];

    public function registration(): BelongsTo
    {
        return $this->belongsTo(RegulatoryRegistration::class, 'registration_id');
    }
}
