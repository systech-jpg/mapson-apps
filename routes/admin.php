<?php

use App\Http\Controllers\Admin\AccurateController;
use App\Http\Controllers\Admin\AttendanceController;
use App\Http\Controllers\Admin\HadirrController;
use App\Http\Controllers\Admin\AnalyticsController;
use App\Http\Controllers\Admin\CompanyController;
use App\Http\Controllers\Admin\IntegrationController;
use App\Http\Controllers\Admin\DepartmentController;
use App\Http\Controllers\Admin\EmployeeController;
use App\Http\Controllers\Admin\EmployeeSubDataController;
use App\Http\Controllers\Admin\MenuController;
use App\Http\Controllers\Admin\OrgUnitController;
use App\Http\Controllers\Admin\PositionController;
use App\Http\Controllers\Admin\RoleAccessController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\UserController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->group(function () {
    // Analytics (reporting)
    Route::get('analytics', [AnalyticsController::class, 'index'])->middleware('menu.access:analytics,view')->name('analytics.index');

    // Data Integration (ERP stock & sales)
    Route::get('integration', [IntegrationController::class, 'index'])->middleware('menu.access:data-integration,view')->name('integration.index');
    Route::post('integration/sync-sales', [IntegrationController::class, 'syncSales'])->middleware('menu.access:data-integration,edit')->name('integration.sync-sales');

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

    // Data Integration → Hadirr
    Route::get('integration/hadirr/settings', [HadirrController::class, 'settings'])->middleware('menu.access:hadirr-setting,view')->name('hadirr.settings');
    Route::put('integration/hadirr/settings', [HadirrController::class, 'update'])->middleware('menu.access:hadirr-setting,edit')->name('hadirr.settings.update');
    Route::post('integration/hadirr/test', [HadirrController::class, 'test'])->middleware('menu.access:hadirr-setting,view')->name('hadirr.test');

    // Human Resources → Data Absensi (fed from Hadirr staging)
    Route::get('attendance', [AttendanceController::class, 'index'])->middleware('menu.access:attendance,view')->name('attendance.index');
    Route::post('attendance/sync', [AttendanceController::class, 'sync'])->middleware('menu.access:attendance,edit')->name('attendance.sync');

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
    Route::get('employees/{employee}/photo', [EmployeeController::class, 'photo'])->middleware('menu.access:employees,view')->name('employees.photo');
});
