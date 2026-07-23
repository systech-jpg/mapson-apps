<?php

use App\Http\Controllers\Admin\AccurateController;
use App\Http\Controllers\Admin\AttendCaseController;
use App\Http\Controllers\Admin\AttendanceController;
use App\Http\Controllers\Admin\HadirrController;
use App\Http\Controllers\Admin\HrSettingController;
use App\Http\Controllers\Admin\AnalyticsController;
use App\Http\Controllers\Admin\CompanyController;
use App\Http\Controllers\Admin\CostMappingController;
use App\Http\Controllers\Admin\DataWarehouseController;
use App\Http\Controllers\Admin\GlClassificationController;
use App\Http\Controllers\Admin\ErpSettingController;
use App\Http\Controllers\Admin\IntegrationController;
use App\Http\Controllers\Admin\StockReconController;
use App\Http\Controllers\Admin\StocktakeReconController;
use App\Http\Controllers\Admin\DepartmentController;
use App\Http\Controllers\Admin\EmployeeController;
use App\Http\Controllers\Admin\EmployeeSubDataController;
use App\Http\Controllers\Admin\LeaveAdminController;
use App\Http\Controllers\Admin\LeaveApprovalController;
use App\Http\Controllers\Admin\LeaveBalanceAdminController;
use App\Http\Controllers\Admin\LeaveHolidayController;
use App\Http\Controllers\Admin\LeaveRequestController;
use App\Http\Controllers\Admin\LeaveTypeController;
use App\Http\Controllers\Admin\NotificationController;
use App\Http\Controllers\Admin\MenuController;
use App\Http\Controllers\Admin\MyDashboardController;
use App\Http\Controllers\Admin\OrgUnitController;
use App\Http\Controllers\Admin\OvertimeAdminController;
use App\Http\Controllers\Admin\OvertimeApprovalController;
use App\Http\Controllers\Admin\OvertimeController;
use App\Http\Controllers\Admin\OvertimeSettingController;
use App\Http\Controllers\Admin\PositionController;
use App\Http\Controllers\Admin\PricelistController;
use App\Http\Controllers\Admin\PricingApprovalController;
use App\Http\Controllers\Admin\PricingEngineController;
use App\Http\Controllers\Admin\PricingSettingController;
use App\Http\Controllers\Admin\RoleAccessController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\UserController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->group(function () {
    // Personal self-service dashboard (Beranda).
    Route::get('beranda', [MyDashboardController::class, 'index'])->middleware('menu.access:my-dashboard,view')->name('beranda');
    Route::get('beranda/photo', [MyDashboardController::class, 'photo'])->middleware('menu.access:my-dashboard,view')->name('beranda.photo');

    // In-app notifications (no menu gate — available to all authenticated users).
    Route::post('notifications/read-all', [NotificationController::class, 'readAll'])->name('notifications.read-all');
    Route::post('notifications/{id}/read', [NotificationController::class, 'read'])->name('notifications.read');

    // Analytics (reporting)
    Route::get('analytics', [AnalyticsController::class, 'index'])->middleware('menu.access:analytics,view')->name('analytics.index');

    // Data Warehouse — pantau sumber yang ditarik + kelola data yang diunggah manual (GL).
    Route::middleware('menu.access:dwh-pipeline,view')->group(function () {
        Route::get('data-warehouse/pipeline', [DataWarehouseController::class, 'pipeline'])->name('dwh.pipeline');
        Route::post('data-warehouse/gl/upload', [DataWarehouseController::class, 'uploadGl'])->name('dwh.gl.upload');
        Route::delete('data-warehouse/gl/{period}', [DataWarehouseController::class, 'destroyGlPeriod'])->name('dwh.gl.destroy');
    });

    // Master ABC costing — pemetaan akun GL → pool aktivitas (split %).
    Route::middleware('menu.access:dwh-cost-mapping,view')->group(function () {
        Route::get('data-warehouse/cost-mapping', [CostMappingController::class, 'index'])->name('dwh.cost-mapping');
        Route::post('data-warehouse/cost-mapping/allocation', [CostMappingController::class, 'storeAllocation'])
            ->middleware('menu.access:dwh-cost-mapping,edit')->name('dwh.cost-mapping.allocation');
    });

    // Klasifikasi GL → CapEx/OpEx → departemen (per akun + override per record).
    Route::middleware('menu.access:dwh-gl-classification,view')->group(function () {
        Route::get('data-warehouse/gl-classification', [GlClassificationController::class, 'index'])->name('dwh.gl-classification');
        Route::get('data-warehouse/gl-classification/rows', [GlClassificationController::class, 'rows'])->name('dwh.gl-classification.rows');
        Route::get('data-warehouse/gl-classification/split', [GlClassificationController::class, 'splitDetail'])->name('dwh.gl-classification.split-detail');
        Route::middleware('menu.access:dwh-gl-classification,edit')->group(function () {
            Route::post('data-warehouse/gl-classification/account', [GlClassificationController::class, 'storeAccount'])->name('dwh.gl-classification.account');
            Route::post('data-warehouse/gl-classification/row', [GlClassificationController::class, 'storeRow'])->name('dwh.gl-classification.row');
            Route::post('data-warehouse/gl-classification/split', [GlClassificationController::class, 'storeSplit'])->name('dwh.gl-classification.split');
            Route::post('data-warehouse/gl-classification/repair', [GlClassificationController::class, 'repair'])->name('dwh.gl-classification.repair');
        });
    });

    // Data Integration (ERP stock & sales)
    Route::get('integration', [IntegrationController::class, 'index'])->middleware('menu.access:data-integration,view')->name('integration.index');
    Route::get('integration/sync-logs', [IntegrationController::class, 'logs'])->middleware('menu.access:sync-logs,view')->name('integration.logs');

    // Monitoring Pembelian — total per principal per tahun + drill-down item.
    Route::middleware('menu.access:purchase-monitor,view')->group(function () {
        Route::get('integration/purchase-monitor', [\App\Http\Controllers\Admin\PurchaseMonitorController::class, 'index'])->name('purchase-monitor.index');
        Route::get('integration/purchase-monitor/drilldown', [\App\Http\Controllers\Admin\PurchaseMonitorController::class, 'drilldown'])->name('purchase-monitor.drilldown');
    });
    Route::post('integration/sync-sales', [IntegrationController::class, 'syncSales'])->middleware('menu.access:data-integration,edit')->name('integration.sync-sales');
    Route::get('integration/erp/settings', [ErpSettingController::class, 'settings'])->middleware('menu.access:erp-setting,view')->name('erp.settings');
    Route::put('integration/erp/settings', [ErpSettingController::class, 'update'])->middleware('menu.access:erp-setting,edit')->name('erp.settings.update');
    Route::post('integration/erp/test', [ErpSettingController::class, 'test'])->middleware('menu.access:erp-setting,view')->name('erp.test');
    Route::get('integration/stock', [IntegrationController::class, 'stock'])->middleware('menu.access:erp-stock,view')->name('integration.stock');
    Route::post('integration/sync-stock', [IntegrationController::class, 'syncStock'])->middleware('menu.access:erp-stock,edit')->name('integration.sync-stock');

    // Data Integration → Accurate
    Route::get('integration/accurate/settings', [AccurateController::class, 'settings'])->middleware('menu.access:accurate-setting,view')->name('accurate.settings');
    Route::put('integration/accurate/settings', [AccurateController::class, 'update'])->middleware('menu.access:accurate-setting,edit')->name('accurate.settings.update');
    Route::post('integration/accurate/test', [AccurateController::class, 'test'])->middleware('menu.access:accurate-setting,view')->name('accurate.test');
    Route::get('integration/accurate/connect', [AccurateController::class, 'connect'])->middleware('menu.access:accurate-setting,edit')->name('accurate.connect');
    Route::get('integration/accurate/callback', [AccurateController::class, 'callback'])->middleware('menu.access:accurate-setting,edit')->name('accurate.callback');
    Route::get('integration/accurate/databases', [AccurateController::class, 'databases'])->middleware('menu.access:accurate-setting,view')->name('accurate.databases');
    Route::post('integration/accurate/open-db', [AccurateController::class, 'openDb'])->middleware('menu.access:accurate-setting,edit')->name('accurate.open-db');
    Route::post('integration/accurate/disconnect', [AccurateController::class, 'disconnect'])->middleware('menu.access:accurate-setting,edit')->name('accurate.disconnect');
    Route::get('integration/accurate/sales', [AccurateController::class, 'salesPage'])->middleware('menu.access:accurate-sales,view')->name('accurate.sales');
    Route::get('integration/accurate/sales/data', [AccurateController::class, 'salesData'])->middleware('menu.access:accurate-sales,view')->name('accurate.sales.data');
    Route::get('integration/accurate/sales/{id}/detail', [AccurateController::class, 'salesDetail'])->whereNumber('id')->middleware('menu.access:accurate-sales,view')->name('accurate.sales.detail');
    Route::get('integration/accurate/staging', [AccurateController::class, 'staging'])->middleware('menu.access:accurate-staging,view')->name('accurate.staging');
    Route::post('integration/accurate/staging/sync', [AccurateController::class, 'stagingSync'])->middleware('menu.access:accurate-staging,edit')->name('accurate.staging.sync');
    Route::post('integration/accurate/staging/sync-movements', [AccurateController::class, 'stockMovementsSync'])->middleware('menu.access:accurate-staging,edit')->name('accurate.staging.sync-movements');
    Route::get('integration/accurate/staging/export', [AccurateController::class, 'stagingExport'])->middleware('menu.access:accurate-staging,view')->name('accurate.staging.export');
    Route::get('integration/accurate/stock', [AccurateController::class, 'stock'])->middleware('menu.access:accurate-stock,view')->name('accurate.stock');
    Route::post('integration/accurate/stock/sync', [AccurateController::class, 'stockSync'])->middleware('menu.access:accurate-stock,edit')->name('accurate.stock.sync');
    Route::get('integration/accurate/stock/export', [AccurateController::class, 'stockExport'])->middleware('menu.access:accurate-stock,view')->name('accurate.stock.export');
    Route::get('stock-recon', [StockReconController::class, 'index'])->middleware('menu.access:stock-recon,view')->name('stock.recon');
    Route::get('stock-recon/export', [StockReconController::class, 'export'])->middleware('menu.access:stock-recon,view')->name('stock.recon.export');
    Route::get('stock-recon/detail', [StockReconController::class, 'detail'])->middleware('menu.access:stock-recon,view')->name('stock.recon.detail');

    Route::get('stocktake-recon', [StocktakeReconController::class, 'index'])->middleware('menu.access:stocktake-recon,view')->name('stocktake.recon');
    Route::get('stocktake-recon/export', [StocktakeReconController::class, 'export'])->middleware('menu.access:stocktake-recon,view')->name('stocktake.recon.export');
    Route::post('stocktake-recon/import', [StocktakeReconController::class, 'import'])->middleware('menu.access:stocktake-recon,edit')->name('stocktake.recon.import');
    Route::post('stocktake-recon/sync-erp', [StocktakeReconController::class, 'syncFromErp'])->middleware('menu.access:stocktake-recon,edit')->name('stocktake.recon.sync-erp');

    // Data Integration → Hadirr
    Route::get('integration/hadirr/settings', [HadirrController::class, 'settings'])->middleware('menu.access:hadirr-setting,view')->name('hadirr.settings');
    Route::put('integration/hadirr/settings', [HadirrController::class, 'update'])->middleware('menu.access:hadirr-setting,edit')->name('hadirr.settings.update');
    Route::post('integration/hadirr/test', [HadirrController::class, 'test'])->middleware('menu.access:hadirr-setting,view')->name('hadirr.test');

    // Human Resources → Data Absensi (fed from Hadirr staging)
    Route::get('attendance', [AttendanceController::class, 'index'])->middleware('menu.access:attendance-raw,view')->name('attendance.index');
    Route::post('attendance/sync', [AttendanceController::class, 'sync'])->middleware('menu.access:attendance-raw,edit')->name('attendance.sync');
    Route::get('attendance/hours', [AttendanceController::class, 'hours'])->middleware('menu.access:attendance-hours,view')->name('attendance.hours');
    Route::get('attendance/hours/export', [AttendanceController::class, 'exportHours'])->middleware('menu.access:attendance-hours,view')->name('attendance.hours.export');
    Route::get('attendance/recap', [AttendanceController::class, 'attendance'])->middleware('menu.access:attendance-recap,view')->name('attendance.recap');
    Route::get('attendance/recap/export', [AttendanceController::class, 'exportAttendance'])->middleware('menu.access:attendance-recap,view')->name('attendance.recap.export');
    Route::get('attendance/recap/pdf', [AttendanceController::class, 'exportPdf'])->middleware('menu.access:attendance-recap,view')->name('attendance.recap.pdf');

    // Leave Management — Cuti Saya
    Route::get('leave', [LeaveRequestController::class, 'index'])->middleware('menu.access:leave-mine,view')->name('leave.index');
    Route::post('leave', [LeaveRequestController::class, 'store'])->middleware('menu.access:leave-mine,create')->name('leave.store');
    Route::get('leave/{leave}', [LeaveRequestController::class, 'show'])->middleware('menu.access:leave-mine,view')->name('leave.show');
    Route::get('leave/{leave}/pdf', [LeaveRequestController::class, 'pdf'])->name('leave.pdf'); // owner OR approver/HR (policy view)
    Route::post('leave/{leave}/withdraw', [LeaveRequestController::class, 'withdraw'])->middleware('menu.access:leave-mine,view')->name('leave.withdraw');
    Route::post('leave/{leave}/cancel', [LeaveRequestController::class, 'cancel'])->middleware('menu.access:leave-mine,view')->name('leave.cancel');
    Route::get('leave/{leave}/attachments/{attachment}', [LeaveRequestController::class, 'downloadAttachment'])->whereNumber('attachment')->middleware('menu.access:leave-mine,view')->name('leave.attachments.download');

    // Leave Management — Persetujuan Cuti (approver inbox)
    Route::get('leave-approvals', [LeaveApprovalController::class, 'index'])->middleware('menu.access:leave-approvals,view')->name('leave.approvals.index');
    Route::post('leave-approvals/{leave}/approve', [LeaveApprovalController::class, 'approve'])->middleware('menu.access:leave-approvals,edit')->name('leave.approvals.approve');
    Route::post('leave-approvals/{leave}/reject', [LeaveApprovalController::class, 'reject'])->middleware('menu.access:leave-approvals,edit')->name('leave.approvals.reject');

    // Leave Management — Admin/HR
    Route::get('leave-admin/requests', [LeaveAdminController::class, 'index'])->middleware('menu.access:leave-admin-requests,view')->name('leave.admin.requests');
    Route::post('leave-admin/requests/{leave}/cancel', [LeaveAdminController::class, 'cancel'])->middleware('menu.access:leave-admin-requests,edit')->name('leave.admin.cancel');
    Route::put('leave-admin/requests/{leave}', [LeaveAdminController::class, 'update'])->middleware('menu.access:leave-admin-requests,edit')->name('leave.admin.update');
    Route::delete('leave-admin/requests/{leave}', [LeaveAdminController::class, 'destroy'])->middleware('menu.access:leave-admin-requests,delete')->name('leave.admin.destroy');
    Route::post('leave-admin/record', [LeaveAdminController::class, 'record'])->middleware('menu.access:leave-admin-requests,create')->name('leave.admin.record');
    Route::get('leave-admin/balances', [LeaveBalanceAdminController::class, 'index'])->middleware('menu.access:leave-admin-balances,view')->name('leave.admin.balances');
    Route::post('leave-admin/balances/adjust', [LeaveBalanceAdminController::class, 'adjust'])->middleware('menu.access:leave-admin-balances,edit')->name('leave.admin.balances.adjust');
    Route::post('leave-admin/balances/accrue', [LeaveBalanceAdminController::class, 'accrue'])->middleware('menu.access:leave-admin-balances,edit')->name('leave.admin.balances.accrue');
    // Jenis Cuti & Hari Libur — CRUD now lives in the consolidated Pengaturan page (hr-settings).
    Route::post('leave-types', [LeaveTypeController::class, 'store'])->middleware('menu.access:hr-settings,create')->name('leave-types.store');
    Route::put('leave-types/{leave_type}', [LeaveTypeController::class, 'update'])->middleware('menu.access:hr-settings,edit')->name('leave-types.update');
    Route::delete('leave-types/{leave_type}', [LeaveTypeController::class, 'destroy'])->middleware('menu.access:hr-settings,delete')->name('leave-types.destroy');
    Route::post('leave-holidays', [LeaveHolidayController::class, 'store'])->middleware('menu.access:hr-settings,create')->name('leave-holidays.store');
    Route::put('leave-holidays/{leave_holiday}', [LeaveHolidayController::class, 'update'])->middleware('menu.access:hr-settings,edit')->name('leave-holidays.update');
    Route::delete('leave-holidays/{leave_holiday}', [LeaveHolidayController::class, 'destroy'])->middleware('menu.access:hr-settings,delete')->name('leave-holidays.destroy');

    // Pengaturan Kepegawaian (consolidated: absensi, lembur, jenis cuti, hari libur, fee attend case).
    Route::get('hr-settings', [HrSettingController::class, 'index'])->middleware('menu.access:hr-settings,view')->name('hr-settings.index');
    Route::put('hr-settings/attendance', [HrSettingController::class, 'updateAttendance'])->middleware('menu.access:hr-settings,edit')->name('hr-settings.attendance');
    Route::post('hr-settings/attend-tiers', [HrSettingController::class, 'storeAttendTier'])->middleware('menu.access:hr-settings,create')->name('hr-settings.attend-tiers.store');
    Route::put('hr-settings/attend-tiers/{tier}', [HrSettingController::class, 'updateAttendTier'])->middleware('menu.access:hr-settings,edit')->name('hr-settings.attend-tiers.update');
    Route::delete('hr-settings/attend-tiers/{tier}', [HrSettingController::class, 'destroyAttendTier'])->middleware('menu.access:hr-settings,delete')->name('hr-settings.attend-tiers.destroy');

    // Finance — Pricing Engine (profile-based, editable grid + Excel upload)
    Route::get('finance/pricing-engine', [PricingEngineController::class, 'index'])->middleware('menu.access:pricing-engine,view')->name('pricing-engine.index');
    Route::post('finance/pricing-engine/principal', [PricingEngineController::class, 'storePrincipal'])->middleware('menu.access:pricing-engine,create')->name('pricing-engine.principal');
    Route::post('finance/pricing-engine/hospital', [PricingEngineController::class, 'storeHospital'])->middleware('menu.access:pricing-engine,create')->name('pricing-engine.hospital');
    Route::post('finance/pricing-engine/save', [PricingEngineController::class, 'save'])->middleware('menu.access:pricing-engine,edit')->name('pricing-engine.save');
    Route::get('finance/pricing-engine/history', [PricingEngineController::class, 'history'])->middleware('menu.access:pricing-engine,view')->name('pricing-engine.history');
    Route::post('finance/pricing-engine/submit', [PricingApprovalController::class, 'submit'])->middleware('menu.access:pricing-engine,edit')->name('pricing-engine.submit');

    // Finance — Persetujuan Harga (CEO)
    Route::get('finance/pricing-approval', [PricingApprovalController::class, 'index'])->middleware('menu.access:pricing-approval,view')->name('pricing-approval.index');
    Route::post('finance/pricing-approval/{submission}/approve', [PricingApprovalController::class, 'approve'])->middleware('menu.access:pricing-approval,edit')->name('pricing-approval.approve');
    Route::post('finance/pricing-approval/{submission}/reject', [PricingApprovalController::class, 'reject'])->middleware('menu.access:pricing-approval,edit')->name('pricing-approval.reject');
    Route::post('finance/pricing-approval/item/{item}', [PricingApprovalController::class, 'decideItem'])->middleware('menu.access:pricing-approval,edit')->name('pricing-approval.item');
    Route::post('finance/pricing-approval/{submission}/attach', [PricingApprovalController::class, 'attach'])->middleware('menu.access:pricing-approval,edit')->name('pricing-approval.attach');
    Route::get('finance/pricing-attachment/{attachment}', [PricingApprovalController::class, 'download'])->name('pricing-approval.download');

    // Finance — Pricelist (approved prices, read-only + history + attachments)
    Route::get('finance/pricelist', [PricelistController::class, 'index'])->middleware('menu.access:pricelist,view')->name('pricelist.index');

    // Finance — Master (kelola profil & mata uang)
    Route::get('finance/pricing-profiles', [PricingSettingController::class, 'profiles'])->middleware('menu.access:pricing-profiles,view')->name('pricing-profiles.index');
    Route::post('finance/pricing-profiles', [PricingSettingController::class, 'saveProfiles'])->middleware('menu.access:pricing-profiles,edit')->name('pricing-profiles.save');
    Route::get('finance/currencies', [PricingSettingController::class, 'currencies'])->middleware('menu.access:currencies,view')->name('currencies.index');
    Route::post('finance/currencies', [PricingSettingController::class, 'saveCurrencies'])->middleware('menu.access:currencies,edit')->name('currencies.save');
    Route::get('finance/pricelist/export', [PricelistController::class, 'export'])->middleware('menu.access:pricelist,view')->name('pricelist.export');

    // Attend Case (read from ERP).
    Route::get('attend-case', [AttendCaseController::class, 'mine'])->middleware('menu.access:attend-mine,view')->name('attend-case.mine');
    Route::get('attend-case-admin', [AttendCaseController::class, 'index'])->middleware('menu.access:attend-admin,view')->name('attend-case.admin');
    Route::get('attend-case-admin/breakdown/{erpUserId}', [AttendCaseController::class, 'breakdown'])->whereNumber('erpUserId')->middleware('menu.access:attend-admin,view')->name('attend-case.breakdown');

    // Overtime — Lembur Saya (employee)
    Route::get('overtime', [OvertimeController::class, 'index'])->middleware('menu.access:overtime-mine,view')->name('overtime.index');
    Route::post('overtime/entries', [OvertimeController::class, 'storeEntry'])->middleware('menu.access:overtime-mine,create')->name('overtime.entries.store');
    Route::put('overtime/entries/{entry}', [OvertimeController::class, 'updateEntry'])->middleware('menu.access:overtime-mine,create')->name('overtime.entries.update');
    Route::delete('overtime/entries/{entry}', [OvertimeController::class, 'destroyEntry'])->middleware('menu.access:overtime-mine,create')->name('overtime.entries.destroy');
    Route::post('overtime/{overtime}/submit', [OvertimeController::class, 'submit'])->middleware('menu.access:overtime-mine,create')->name('overtime.submit');
    Route::post('overtime/{overtime}/back-to-draft', [OvertimeController::class, 'backToDraft'])->middleware('menu.access:overtime-mine,create')->name('overtime.back-to-draft');
    Route::get('overtime/{overtime}/pdf', [OvertimeController::class, 'pdf'])->name('overtime.pdf'); // owner OR HR/admin (checked in controller)

    // Overtime — Persetujuan Lembur (supervisor per-row + HR per-period)
    Route::get('overtime-approvals', [OvertimeApprovalController::class, 'index'])->middleware('menu.access:overtime-approvals,view')->name('overtime.approvals.index');
    Route::post('overtime-approvals/entries/{entry}/decide', [OvertimeApprovalController::class, 'decideEntry'])->middleware('menu.access:overtime-approvals,edit')->name('overtime.approvals.entry');
    Route::post('overtime-approvals/{overtime}/approve', [OvertimeApprovalController::class, 'approve'])->middleware('menu.access:overtime-approvals,edit')->name('overtime.approvals.approve');
    Route::post('overtime-approvals/{overtime}/reject', [OvertimeApprovalController::class, 'reject'])->middleware('menu.access:overtime-approvals,edit')->name('overtime.approvals.reject');
    Route::post('overtime-approvals/{overtime}/return', [OvertimeApprovalController::class, 'returnToDraft'])->middleware('menu.access:overtime-approvals,edit')->name('overtime.approvals.return');

    // Overtime — Admin/HR
    Route::get('overtime-admin', [OvertimeAdminController::class, 'index'])->middleware('menu.access:overtime-admin,view')->name('overtime.admin.index');
    Route::get('overtime-admin/export', [OvertimeAdminController::class, 'export'])->middleware('menu.access:overtime-admin,view')->name('overtime.admin.export');
    Route::get('overtime-admin/recap-pdf', [OvertimeAdminController::class, 'recapPdf'])->middleware('menu.access:overtime-admin,view')->name('overtime.admin.recap-pdf');
    Route::get('overtime-admin/{overtime}', [OvertimeAdminController::class, 'show'])->middleware('menu.access:overtime-admin,view')->name('overtime.admin.show');
    Route::post('overtime-admin/{overtime}/entries', [OvertimeAdminController::class, 'storeEntry'])->middleware('menu.access:overtime-admin,edit')->name('overtime.admin.entries.store');
    Route::put('overtime-admin/entries/{entry}', [OvertimeAdminController::class, 'updateEntry'])->middleware('menu.access:overtime-admin,edit')->name('overtime.admin.entries.update');
    Route::delete('overtime-admin/entries/{entry}', [OvertimeAdminController::class, 'destroyEntry'])->middleware('menu.access:overtime-admin,edit')->name('overtime.admin.entries.destroy');
    Route::put('overtime-setting', [OvertimeSettingController::class, 'update'])->middleware('menu.access:hr-settings,edit')->name('overtime.settings.update');

    // Users
    Route::get('users', [UserController::class, 'index'])->middleware('menu.access:users,view')->name('users.index');
    Route::get('users/create', [UserController::class, 'create'])->middleware('menu.access:users,create')->name('users.create');
    Route::post('users', [UserController::class, 'store'])->middleware('menu.access:users,create')->name('users.store');
    Route::get('users/{user}/edit', [UserController::class, 'edit'])->middleware('menu.access:users,edit')->name('users.edit');
    Route::put('users/{user}', [UserController::class, 'update'])->middleware('menu.access:users,edit')->name('users.update');
    Route::delete('users/{user}', [UserController::class, 'destroy'])->middleware('menu.access:users,delete')->name('users.destroy');

    // Roles
    Route::get('roles', [RoleController::class, 'index'])->middleware('menu.access:roles,view')->name('roles.index');
    Route::get('roles/create', [RoleController::class, 'create'])->middleware('menu.access:roles,create')->name('roles.create');
    Route::post('roles', [RoleController::class, 'store'])->middleware('menu.access:roles,create')->name('roles.store');
    Route::get('roles/{role}/edit', [RoleController::class, 'edit'])->middleware('menu.access:roles,edit')->name('roles.edit');
    Route::put('roles/{role}', [RoleController::class, 'update'])->middleware('menu.access:roles,edit')->name('roles.update');
    Route::delete('roles/{role}', [RoleController::class, 'destroy'])->middleware('menu.access:roles,delete')->name('roles.destroy');

    // Role access matrix
    Route::get('roles/{role}/access', [RoleAccessController::class, 'edit'])->middleware('menu.access:roles,edit')->name('roles.access.edit');
    Route::put('roles/{role}/access', [RoleAccessController::class, 'update'])->middleware('menu.access:roles,edit')->name('roles.access.update');

    // Menus
    Route::get('menus', [MenuController::class, 'index'])->middleware('menu.access:menus,view')->name('menus.index');
    Route::post('menus', [MenuController::class, 'store'])->middleware('menu.access:menus,create')->name('menus.store');
    Route::put('menus/{menu}', [MenuController::class, 'update'])->middleware('menu.access:menus,edit')->name('menus.update');
    Route::delete('menus/{menu}', [MenuController::class, 'destroy'])->middleware('menu.access:menus,delete')->name('menus.destroy');

    // Departments
    Route::get('departments', [DepartmentController::class, 'index'])->middleware('menu.access:departments,view')->name('departments.index');
    Route::post('departments', [DepartmentController::class, 'store'])->middleware('menu.access:departments,create')->name('departments.store');
    Route::put('departments/{department}', [DepartmentController::class, 'update'])->middleware('menu.access:departments,edit')->name('departments.update');
    Route::delete('departments/{department}', [DepartmentController::class, 'destroy'])->middleware('menu.access:departments,delete')->name('departments.destroy');

    // Positions
    Route::get('positions', [PositionController::class, 'index'])->middleware('menu.access:positions,view')->name('positions.index');
    Route::post('positions', [PositionController::class, 'store'])->middleware('menu.access:positions,create')->name('positions.store');
    Route::put('positions/{position}', [PositionController::class, 'update'])->middleware('menu.access:positions,edit')->name('positions.update');
    Route::delete('positions/{position}', [PositionController::class, 'destroy'])->middleware('menu.access:positions,delete')->name('positions.destroy');

    // Companies
    Route::get('companies', [CompanyController::class, 'index'])->middleware('menu.access:companies,view')->name('companies.index');
    Route::post('companies', [CompanyController::class, 'store'])->middleware('menu.access:companies,create')->name('companies.store');
    Route::put('companies/{company}', [CompanyController::class, 'update'])->middleware('menu.access:companies,edit')->name('companies.update');
    Route::delete('companies/{company}', [CompanyController::class, 'destroy'])->middleware('menu.access:companies,delete')->name('companies.destroy');

    // Organizational Units
    Route::get('org-units', [OrgUnitController::class, 'index'])->middleware('menu.access:org-units,view')->name('org-units.index');
    Route::post('org-units', [OrgUnitController::class, 'store'])->middleware('menu.access:org-units,create')->name('org-units.store');
    Route::put('org-units/{org_unit}', [OrgUnitController::class, 'update'])->middleware('menu.access:org-units,edit')->name('org-units.update');
    Route::delete('org-units/{org_unit}', [OrgUnitController::class, 'destroy'])->middleware('menu.access:org-units,delete')->name('org-units.destroy');

    // Employees
    Route::get('employees', [EmployeeController::class, 'index'])->middleware('menu.access:employees,view')->name('employees.index');
    Route::get('employees/create', [EmployeeController::class, 'create'])->middleware('menu.access:employees,create')->name('employees.create');
    Route::post('employees', [EmployeeController::class, 'store'])->middleware('menu.access:employees,create')->name('employees.store');
    Route::get('employees/{employee}', [EmployeeController::class, 'show'])->middleware('menu.access:employees,view')->name('employees.show');
    Route::put('employees/{employee}', [EmployeeController::class, 'update'])->middleware('menu.access:employees,edit')->name('employees.update');
    Route::post('employees/{employee}/assignment', [EmployeeController::class, 'changeAssignment'])->middleware('menu.access:employees,edit')->name('employees.assignment');
    Route::delete('employees/{employee}', [EmployeeController::class, 'destroy'])->middleware('menu.access:employees,delete')->name('employees.destroy')->withTrashed();
    Route::put('employees/{employee}/restore', [EmployeeController::class, 'restore'])->middleware('menu.access:employees,edit')->name('employees.restore')->withTrashed();
    Route::post('employees/{employee}/contracts', [EmployeeController::class, 'storeContract'])->middleware('menu.access:employees,edit')->name('employees.contracts.store');
    Route::put('employees/{employee}/contracts/{contract}', [EmployeeController::class, 'updateContract'])->middleware('menu.access:employees,edit')->name('employees.contracts.update');
    Route::delete('employees/{employee}/contracts/{contract}', [EmployeeController::class, 'destroyContract'])->middleware('menu.access:employees,delete')->name('employees.contracts.destroy');
    Route::post('employees/{employee}/sub/{type}', [EmployeeSubDataController::class, 'store'])->middleware('menu.access:employees,edit')->whereIn('type', EmployeeSubDataController::TYPES)->name('employees.sub.store');
    Route::put('employees/{employee}/sub/{type}/{record}', [EmployeeSubDataController::class, 'update'])->middleware('menu.access:employees,edit')->whereIn('type', EmployeeSubDataController::TYPES)->whereNumber('record')->name('employees.sub.update');
    Route::delete('employees/{employee}/sub/{type}/{record}', [EmployeeSubDataController::class, 'destroy'])->middleware('menu.access:employees,delete')->whereIn('type', EmployeeSubDataController::TYPES)->whereNumber('record')->name('employees.sub.destroy');
    Route::post('employees/{employee}/documents', [EmployeeController::class, 'storeDocument'])->middleware('menu.access:employees,edit')->name('employees.documents.store');
    Route::put('employees/{employee}/documents/{document}', [EmployeeController::class, 'updateDocument'])->middleware('menu.access:employees,edit')->name('employees.documents.update');
    Route::get('employees/{employee}/documents/{document}/download', [EmployeeController::class, 'downloadDocument'])->middleware('menu.access:employees,view')->name('employees.documents.download');
    Route::delete('employees/{employee}/documents/{document}', [EmployeeController::class, 'destroyDocument'])->middleware('menu.access:employees,delete')->name('employees.documents.destroy');
    Route::get('employees/{employee}/photo', [EmployeeController::class, 'photo'])->middleware('menu.access:employees,view')->name('employees.photo');
});
