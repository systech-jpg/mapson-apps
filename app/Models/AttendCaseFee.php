<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A parameterized attend-case fee tier. Users define any number of tiers (number +
 * name), each with a workday fee, a holiday/weekend ("tanggal merah") fee per case,
 * and a basis: 'tindakan' (counted & paid monthly) or 'invoice' (carried over from a
 * paid invoice — computed separately, handled later).
 */
class AttendCaseFee extends Model
{
    public const BASIS_TINDAKAN = 'tindakan';

    public const BASIS_INVOICE = 'invoice';

    protected $fillable = ['tier', 'label', 'fee_workday', 'fee_holiday', 'basis', 'sort_order', 'is_active'];

    protected function casts(): array
    {
        return [
            'fee_workday' => 'decimal:2',
            'fee_holiday' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }
}
