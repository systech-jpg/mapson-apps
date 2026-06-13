<?php

return [
    // Also send leave notifications by email (needs SMTP configured). In-app
    // (database) notifications are always on.
    'notify_mail' => env('LEAVE_NOTIFY_MAIL', false),

    // Working days in ISO weekday numbers (1 = Monday .. 7 = Sunday).
    // Default Mon–Fri; set to include 6 if the company works Saturday.
    'workdays' => [1, 2, 3, 4, 5],

    // Service threshold for the tenure-based accrual: employees with at least
    // this many months of service (and permanent status) get the full lump-sum;
    // below it, annual leave is accrued pro-rata per month.
    'tenure_months_for_lumpsum' => 12,

    // Approval flow per leave type code (fallback: 'default'). Each level has a
    // role; optional 'min_days' makes the level apply only when total_days >= it.
    // supervisor/manager = person-based (rantai atasan); hr/director = role-based.
    'approval_flow' => [
        'default' => [
            ['role' => 'supervisor'],
            ['role' => 'hr'],
        ],
        'ANNUAL' => [
            ['role' => 'supervisor'],
            ['role' => 'manager', 'min_days' => 3],
            ['role' => 'hr'],
            ['role' => 'director', 'min_days' => 5.5],
        ],
        'SICK' => [['role' => 'supervisor'], ['role' => 'hr']],
        'MARRIAGE' => [['role' => 'supervisor'], ['role' => 'hr']],
        'MATERNITY' => [['role' => 'supervisor'], ['role' => 'manager'], ['role' => 'hr']],
        'PATERNITY' => [['role' => 'supervisor'], ['role' => 'hr']],
        'PERMISSION' => [['role' => 'supervisor'], ['role' => 'hr']],
        'HALFDAY' => [['role' => 'supervisor']],
        'WFH' => [['role' => 'supervisor']],
        'UNPAID' => [
            ['role' => 'supervisor'],
            ['role' => 'manager'],
            ['role' => 'hr'],
            ['role' => 'director'],
        ],
    ],

    // RBAC role slugs that may act on role-based approval steps (HR / Director).
    'approver_roles' => [
        'hr' => ['hr', 'hr-admin', 'human-resource', 'human-resources', 'hrd'],
        'director' => ['director', 'direksi', 'direktur'],
    ],
];
