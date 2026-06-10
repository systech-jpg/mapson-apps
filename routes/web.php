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
    Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');
    Route::get('dashboard/drilldown', [DashboardController::class, 'drilldown'])->name('dashboard.drilldown');
});

require __DIR__.'/admin.php';
require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
