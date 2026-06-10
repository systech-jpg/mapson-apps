<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SalesFact extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    // Dates are kept as plain 'Y-m-d' strings from the DB (no Carbon cast) so the
    // UI shows clean dates without timezone-shifted ISO timestamps.
}
