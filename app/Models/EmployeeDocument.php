<?php

namespace App\Models;

use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmployeeDocument extends Model
{
    use Auditable, SoftDeletes;

    protected $fillable = [
        'employee_id', 'category', 'title', 'original_name', 'path', 'mime', 'size',
        'issued_date', 'expiry_date', 'notes', 'uploaded_by',
    ];

    protected function casts(): array
    {
        return ['issued_date' => 'date', 'expiry_date' => 'date', 'size' => 'integer'];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
