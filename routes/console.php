<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Leave: refresh entitlement on the 1st each month (top-up pro-rata joiners + carry-over).
Schedule::command('leave:accrue')->monthlyOn(1, '01:00');
