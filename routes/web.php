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
    // Front dashboard (BOD only) — split into top-menu sections; gate direct-URL access too.
    Route::get('dashboard', [DashboardController::class, 'index'])->middleware('menu.access:dashboard,view')->name('dashboard');
    Route::get('dashboard/drilldown', [DashboardController::class, 'drilldown'])->middleware('menu.access:dashboard,view')->name('dashboard.drilldown');
    Route::get('dashboard/finance', [DashboardController::class, 'finance'])->middleware('menu.access:dashboard-finance,view')->name('dashboard.finance');
    Route::get('dashboard/stock', [DashboardController::class, 'stock'])->middleware('menu.access:dashboard-stock,view')->name('dashboard.stock');
    Route::get('dashboard/cost', [DashboardController::class, 'cost'])->middleware('menu.access:dashboard-cost,view')->name('dashboard.cost');
});

require __DIR__.'/admin.php';
require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
