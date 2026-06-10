<?php

return [
    // Eloquent/DB connection name for the ERP source (see config/database.php).
    'connection' => env('ERP_DB_CONNECTION', 'erp'),

    // Dolibarr table prefix (e.g. llxjp_).
    'prefix' => env('ERP_DB_PREFIX', 'llxjp_'),

    // Dolibarr entities to include (comma-separated), e.g. "1" or "1,2".
    'entities' => env('ERP_ENTITIES', '1'),

    // Public base URL of the ERP, for "view in ERP" deep links. Leave empty to disable.
    'base_url' => env('ERP_BASE_URL', ''),
];
