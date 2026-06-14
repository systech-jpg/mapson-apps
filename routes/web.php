<?php

use App\Http\Controllers\Admin\DashboardController;
use App\Support\MenuService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// This is an app, not a website — no public landing page. Send visitors straight to
// login, and authenticated users to their default area (reporting/backend).
Route::get('/', function () {
    if (! Auth::check()) {
        return redirect()->route('login');
    }

    return redirect()->route(app(MenuService::class)->landingRoute(Auth::user()));
})->name('home');

Route::middleware(['auth'])->group(function () {
    // Front dashboard (sales analytics) — BOD only; gate direct-URL access too.
    Route::get('dashboard', [DashboardController::class, 'index'])->middleware('menu.access:dashboard,view')->name('dashboard');
    Route::get('dashboard/drilldown', [DashboardController::class, 'drilldown'])->middleware('menu.access:dashboard,view')->name('dashboard.drilldown');
});

require __DIR__.'/admin.php';
require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
