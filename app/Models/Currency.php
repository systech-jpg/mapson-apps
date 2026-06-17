<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Currency extends Model
{
    protected $primaryKey = 'code';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['code', 'name', 'rate_to_idr'];

    protected function casts(): array
    {
        return ['rate_to_idr' => 'decimal:2'];
    }
}
