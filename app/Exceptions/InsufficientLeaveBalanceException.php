<?php

namespace App\Exceptions;

use RuntimeException;

class InsufficientLeaveBalanceException extends RuntimeException
{
    public function __construct(float $requested, float $available)
    {
        parent::__construct(sprintf(
            'Saldo cuti tidak cukup: butuh %s hari, tersedia %s hari.',
            rtrim(rtrim(number_format($requested, 1), '0'), '.'),
            rtrim(rtrim(number_format($available, 1), '0'), '.'),
        ));
    }
}
