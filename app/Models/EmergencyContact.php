<?php

namespace App\Models;

use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmergencyContact extends Model
{
    use Auditable, SoftDeletes;

    protected $fillable = ['employee_id', 'name', 'relationship', 'phone', 'email', 'address'];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
