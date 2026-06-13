<?php

namespace App\Models;

use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class LeaveType extends Model
{
    use Auditable, SoftDeletes;

    protected $fillable = [
        'code', 'name', 'unit', 'is_paid', 'requires_balance', 'requires_attachment',
        'allow_half_day', 'gender_constraint', 'default_quota', 'accrual_method', 'min_notice_days',
        'max_consecutive_days', 'carry_over_max', 'carry_over_expire_month', 'color',
        'sort_order', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_paid' => 'boolean',
            'requires_balance' => 'boolean',
            'requires_attachment' => 'boolean',
            'allow_half_day' => 'boolean',
            'is_active' => 'boolean',
            'default_quota' => 'decimal:1',
            'carry_over_max' => 'decimal:1',
            'min_notice_days' => 'integer',
            'max_consecutive_days' => 'integer',
            'carry_over_expire_month' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function balances(): HasMany
    {
        return $this->hasMany(LeaveBalance::class);
    }

    public function requests(): HasMany
    {
        return $this->hasMany(LeaveRequest::class);
    }
}
