<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Sensitive sales fields
    |--------------------------------------------------------------------------
    |
    | Position codes (employees.currentPosition.code) allowed to see sensitive
    | sales detail columns — patient & doctor names — in reporting/drilldown
    | views. Super admin always has access (see User::canSeeSensitiveSales()).
    |
    */

    'sensitive_field_positions' => ['CEO', 'HFO', 'HOO'],

];
