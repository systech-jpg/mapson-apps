<?php

use App\Http\Controllers\Admin\BrandAnalysisController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\PivotExplorerController;
use App\Http\Controllers\Admin\ProductAnalysisController;
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
    // Analisa pivot Penjualan per Merk (principal) — halaman turunan dashboard Sales.
    Route::get('dashboard/penjualan-merk', [BrandAnalysisController::class, 'index'])->middleware('menu.access:dashboard,view')->name('dashboard.brand');
    Route::get('dashboard/penjualan-merk/pivot', [BrandAnalysisController::class, 'pivot'])->middleware('menu.access:dashboard,view')->name('dashboard.brand.pivot');
    Route::get('dashboard/penjualan-merk/export', [BrandAnalysisController::class, 'export'])->middleware('menu.access:dashboard,view')->name('dashboard.brand.export');
    Route::get('dashboard/finance', [DashboardController::class, 'finance'])->middleware('menu.access:dashboard-finance,view')->name('dashboard.finance');
    Route::get('dashboard/stock', [DashboardController::class, 'stock'])->middleware('menu.access:dashboard-stock,view')->name('dashboard.stock');
    // Daftar lengkap di balik tiap kotak KPI Stock.
    Route::get('dashboard/stock/drilldown', [DashboardController::class, 'stockDrilldown'])->middleware('menu.access:dashboard-stock,view')->name('dashboard.stock.drilldown');
    // Dashboard eksekutif Purchasing: spending, status PR/PO, lead time, utang & CN, biaya impor.
    Route::get('dashboard/purchasing', [\App\Http\Controllers\Admin\PurchasingDashboardController::class, 'index'])->middleware('menu.access:dashboard-purchasing,view')->name('dashboard.purchasing');
    Route::get('dashboard/purchasing/kpi-drill', [\App\Http\Controllers\Admin\PurchasingDashboardController::class, 'kpiDrill'])->middleware('menu.access:dashboard-purchasing,view')->name('dashboard.purchasing.kpi-drill');
    Route::get('dashboard/purchasing/ap-drill', [\App\Http\Controllers\Admin\PurchasingDashboardController::class, 'apDrill'])->middleware('menu.access:dashboard-purchasing,view')->name('dashboard.purchasing.ap-drill');
    Route::get('dashboard/purchasing/spend-pivot', [\App\Http\Controllers\Admin\PurchasingDashboardController::class, 'spendPivot'])->middleware('menu.access:dashboard-purchasing,view')->name('dashboard.purchasing.spend-pivot');
    Route::get('dashboard/purchasing/import-cost-detail', [\App\Http\Controllers\Admin\PurchasingDashboardController::class, 'importCostDetail'])->middleware('menu.access:dashboard-purchasing,view')->name('dashboard.purchasing.import-cost-detail');
    Route::get('dashboard/cost', [DashboardController::class, 'cost'])->middleware('menu.access:dashboard-cost,view')->name('dashboard.cost');
    // Telusur baris buku besar di balik satu akun — supaya angka bisa diverifikasi sendiri.
    Route::get('dashboard/cost/drilldown', [DashboardController::class, 'costDrilldown'])->middleware('menu.access:dashboard-cost,view')->name('dashboard.cost.drilldown');

    // Pivot Data Penjualan — analisa swalayan (cross-tab) atas sales_facts. Tanpa menu
    // sendiri: diakses via kartu shortcut di dashboard Sales, jadi ikut gate `dashboard`.
    Route::middleware('menu.access:dashboard,view')->group(function () {
        Route::get('analytics/explorer', [PivotExplorerController::class, 'index'])->name('analytics.explorer');
        Route::get('analytics/explorer/pivot', [PivotExplorerController::class, 'pivot'])->name('analytics.explorer.pivot');
        Route::get('analytics/explorer/values', [PivotExplorerController::class, 'fieldValues'])->name('analytics.explorer.values');
        Route::get('analytics/explorer/export', [PivotExplorerController::class, 'export'])->name('analytics.explorer.export');
        // Detail transaksi di balik sel — method yang sama dgn dashboard, gate sendiri.
        Route::get('analytics/explorer/drilldown', [DashboardController::class, 'drilldown'])->name('analytics.explorer.drilldown');
    });

    // TRIAL: Analisa Produk (P&L per produk principal — tabel tmp_).
    Route::middleware('menu.access:dashboard-product,view')->group(function () {
        Route::get('dashboard/analisa-produk', [ProductAnalysisController::class, 'index'])->name('dashboard.product');
        Route::post('dashboard/analisa-produk/sync', [ProductAnalysisController::class, 'sync'])->name('dashboard.product.sync');
        Route::post('dashboard/analisa-produk/mapping', [ProductAnalysisController::class, 'storeMapping'])->name('dashboard.product.mapping.store');
        Route::delete('dashboard/analisa-produk/mapping/{id}', [ProductAnalysisController::class, 'destroyMapping'])->name('dashboard.product.mapping.destroy');
        Route::post('dashboard/analisa-produk/biaya', [ProductAnalysisController::class, 'storeExpense'])->name('dashboard.product.expenses.store');
        Route::delete('dashboard/analisa-produk/biaya/{id}', [ProductAnalysisController::class, 'destroyExpense'])->name('dashboard.product.expenses.destroy');
    });
});

require __DIR__.'/admin.php';
require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
