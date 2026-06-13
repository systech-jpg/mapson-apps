<?php

namespace Database\Seeders;

use App\Models\Menu;
use App\Models\Role;
use Illuminate\Database\Seeder;

class MenuSeeder extends Seeder
{
    public function run(): void
    {
        // Reporting area.
        $dashboard = $this->menu([
            'key' => 'dashboard',
            'title' => 'Dashboard',
            'route' => 'dashboard',
            'icon' => 'LayoutGrid',
            'area' => 'reporting',
            'sort_order' => 1,
        ]);

        $analytics = $this->menu([
            'key' => 'analytics',
            'title' => 'Analisa',
            'route' => 'analytics.index',
            'icon' => 'BarChart3',
            'area' => 'reporting',
            'sort_order' => 2,
        ]);

        // Module: User Management.
        $userManagement = $this->menu([
            'key' => 'user-management',
            'title' => 'User Management',
            'route' => null,
            'icon' => 'Users',
            'sort_order' => 3,
        ]);
        $this->menu(['key' => 'users', 'title' => 'Users', 'route' => 'users.index', 'icon' => 'Users', 'sort_order' => 1], $userManagement->id);
        $this->menu(['key' => 'roles', 'title' => 'Roles', 'route' => 'roles.index', 'icon' => 'Shield', 'sort_order' => 2], $userManagement->id);
        $this->menu(['key' => 'menus', 'title' => 'Menus', 'route' => 'menus.index', 'icon' => 'ListTree', 'sort_order' => 3], $userManagement->id);

        // Module: Organization (master data).
        $organization = $this->menu([
            'key' => 'organization',
            'title' => 'Organization',
            'route' => null,
            'icon' => 'Network',
            'sort_order' => 4,
        ]);
        $this->menu(['key' => 'companies', 'title' => 'Companies', 'route' => 'companies.index', 'icon' => 'Building2', 'sort_order' => 1], $organization->id);
        $this->menu(['key' => 'org-units', 'title' => 'Organizational Units', 'route' => 'org-units.index', 'icon' => 'Network', 'sort_order' => 2], $organization->id);
        $this->menu(['key' => 'positions', 'title' => 'Positions', 'route' => 'positions.index', 'icon' => 'BadgeCheck', 'sort_order' => 3], $organization->id);

        // Module: Human Resources.
        $hr = $this->menu([
            'key' => 'human-resources',
            'title' => 'Human Resources',
            'route' => null,
            'icon' => 'Contact',
            'sort_order' => 5,
        ]);
        $this->menu(['key' => 'employees', 'title' => 'Employees', 'route' => 'employees.index', 'icon' => 'IdCard', 'sort_order' => 1], $hr->id);

        // Sub-module: Data Absensi (3 views).
        $attendance = $this->menu(['key' => 'attendance', 'title' => 'Data Absensi', 'route' => null, 'icon' => 'CalendarCheck', 'sort_order' => 2], $hr->id);
        $this->menu(['key' => 'attendance-raw', 'title' => 'Tarikan Hadirr', 'route' => 'attendance.index', 'icon' => 'Download', 'sort_order' => 1], $attendance->id);
        $this->menu(['key' => 'attendance-hours', 'title' => 'Rekap per Jam', 'route' => 'attendance.hours', 'icon' => 'Clock', 'sort_order' => 2], $attendance->id);

        // Sub-module: Cuti (Leave Management).
        $leave = $this->menu(['key' => 'leave', 'title' => 'Cuti', 'route' => null, 'icon' => 'CalendarDays', 'sort_order' => 3], $hr->id);
        $this->menu(['key' => 'leave-mine', 'title' => 'Cuti Saya', 'route' => 'leave.index', 'icon' => 'CalendarDays', 'sort_order' => 1], $leave->id);
        $this->menu(['key' => 'leave-approvals', 'title' => 'Persetujuan Cuti', 'route' => 'leave.approvals.index', 'icon' => 'Inbox', 'sort_order' => 2], $leave->id);

        // Sub-module: Kelola Cuti (Admin/HR).
        $leaveAdmin = $this->menu(['key' => 'leave-admin', 'title' => 'Kelola Cuti', 'route' => null, 'icon' => 'Settings', 'sort_order' => 4], $hr->id);
        $this->menu(['key' => 'leave-admin-requests', 'title' => 'Semua Pengajuan', 'route' => 'leave.admin.requests', 'icon' => 'Inbox', 'sort_order' => 1], $leaveAdmin->id);
        $this->menu(['key' => 'leave-admin-balances', 'title' => 'Saldo Karyawan', 'route' => 'leave.admin.balances', 'icon' => 'Wallet', 'sort_order' => 2], $leaveAdmin->id);
        $this->menu(['key' => 'leave-types', 'title' => 'Jenis Cuti', 'route' => 'leave-types.index', 'icon' => 'Settings', 'sort_order' => 3], $leaveAdmin->id);
        $this->menu(['key' => 'leave-holidays', 'title' => 'Hari Libur', 'route' => 'leave-holidays.index', 'icon' => 'CalendarCheck', 'sort_order' => 4], $leaveAdmin->id);

        // Module: Integrasi Data.
        $integrasi = $this->menu([
            'key' => 'integrasi-data',
            'title' => 'Integrasi Data',
            'route' => null,
            'icon' => 'DatabaseZap',
            'sort_order' => 6,
        ]);
        $this->menu(['key' => 'data-integration', 'title' => 'ERP (Dolibarr)', 'route' => 'integration.index', 'icon' => 'Database', 'sort_order' => 1], $integrasi->id);

        // Sub-module: Accurate (menu lain menyusul).
        $accurate = $this->menu(['key' => 'accurate', 'title' => 'Accurate', 'route' => null, 'icon' => 'Plug', 'sort_order' => 2], $integrasi->id);
        $this->menu(['key' => 'accurate-setting', 'title' => 'Setting', 'route' => 'accurate.settings', 'icon' => 'Settings', 'sort_order' => 1], $accurate->id);
        $this->menu(['key' => 'accurate-sales', 'title' => 'Penjualan', 'route' => 'accurate.sales', 'icon' => 'ShoppingCart', 'sort_order' => 2], $accurate->id);

        // Sub-module: Hadirr (attendance).
        $hadirr = $this->menu(['key' => 'hadirr', 'title' => 'Hadirr', 'route' => null, 'icon' => 'Fingerprint', 'sort_order' => 3], $integrasi->id);
        $this->menu(['key' => 'hadirr-setting', 'title' => 'Setting', 'route' => 'hadirr.settings', 'icon' => 'Settings', 'sort_order' => 1], $hadirr->id);

        // Grant the Reporting role view access to the dashboard + analytics only.
        $reporting = Role::where('slug', 'reporting')->first();
        if ($reporting) {
            $reporting->menus()->syncWithoutDetaching([
                $dashboard->id => ['can_view' => true],
                $analytics->id => ['can_view' => true],
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    protected function menu(array $attributes, ?int $parentId = null): Menu
    {
        return Menu::updateOrCreate(
            ['key' => $attributes['key']],
            [
                'parent_id' => $parentId,
                'title' => $attributes['title'],
                'area' => $attributes['area'] ?? 'backend',
                'route' => $attributes['route'] ?? null,
                'icon' => $attributes['icon'] ?? null,
                'sort_order' => $attributes['sort_order'] ?? 0,
                'is_active' => true,
            ],
        );
    }
}
