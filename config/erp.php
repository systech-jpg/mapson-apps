<?php

return [
    // Eloquent/DB connection name for the ERP source (see config/database.php).
    'connection' => env('ERP_DB_CONNECTION', 'erp'),

    // ERP table prefix (e.g. llxjp_).
    'prefix' => env('ERP_DB_PREFIX', 'llxjp_'),

    // ERP entities to include (comma-separated), e.g. "1" or "1,2".
    'entities' => env('ERP_ENTITIES', '1'),

    // Public base URL of the ERP, for "view in ERP" deep links. Leave empty to disable.
    'base_url' => env('ERP_BASE_URL', ''),

    // Dolibarr REST API (write ops: buat faktur supplier + payment dari PO).
    // Butuh modul "Web services API REST" aktif di Dolibarr + API key user berhak
    // (fournisseur facture creer). Kosongkan untuk menonaktifkan fitur tulis.
    'api_url' => rtrim(env('ERP_API_URL', ''), '/'),
    'api_key' => env('ERP_API_KEY', ''),
];
