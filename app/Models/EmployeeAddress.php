<?php

namespace App\Models;

use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmployeeAddress extends Model
{
    use Auditable, SoftDeletes;

    protected $fillable = [
        'employee_id', 'type', 'line1', 'line2', 'rt', 'rw', 'kelurahan', 'kecamatan',
        'city', 'province', 'postal_code', 'country', 'is_primary',
    ];

    protected function casts(): array
    {
        return ['is_primary' => 'boolean'];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
