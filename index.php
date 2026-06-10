<?php

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Front controller placed at the project root so the app is reachable at
// http://localhost/mapson-apps without exposing /public in the URL. base_path()
// (and therefore public_path()) is still resolved in bootstrap/app.php, so the
// Vite manifest, storage, and asset paths keep pointing at public/ correctly.

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require __DIR__.'/vendor/autoload.php';

// Bootstrap Laravel and handle the request...
(require_once __DIR__.'/bootstrap/app.php')
    ->handleRequest(Request::capture());
