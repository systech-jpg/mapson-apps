<?php

namespace Database\Seeders;

use App\Models\Menu;
use App\Models\Role;
use Illuminate\Database\Seeder;

class MenuSeeder extends Seeder
{
    public function run(): void
    {
        // Reporting area (front dashboard — BOD only). Split into top-menu sections.
        $dashboard = $this->menu([
            'key' => 'dashboard',
            'title' => 'Sales',
            'route' => 'dashboard',
            'icon' => 'TrendingUp',
            'area' => 'reporting',
            'sort_order' => 1,
        ]);

        $finance = $this->menu([
            'key' => 'dashboard-finance',
            'title' => 'Finance',
            'route' => 'dashboard.finance',
            'icon' => 'Wallet',
            'area' => 'reporting',
            'sort_order' => 2,
        ]);

        $stock = $this->menu([
            'key' => 'dashboard-stock',
            'title' => 'Warehouse',
            'route' => 'dashboard.stock',
            'icon' => 'Boxes',
            'area' => 'reporting',
            'sort_order' => 3,
        ]);

        // Pegangan permission utk TAB "Nilai Persediaan" di dashboard Warehouse — bukan menu
        // navigasi (is_active false), hanya tampil di matriks hak akses role. Role yang
        // diberi "view" akan melihat tab-nya; server juga menolak tanpa izin ini.
        $this->menu([
            'key' => 'dashboard-stock-cost',
            'title' => 'Warehouse — Tab Nilai Persediaan',
            'route' => 'dashboard.stock',
            'icon' => 'Boxes',
            'area' => 'reporting',
            'sort_order' => 3,
            'is_active' => false,
        ]);

        // Disembunyikan sementara (permintaan BOD 2026-07-26) — route tetap hidup, menu saja
        // yang nonaktif; aktifkan lagi dengan is_active => true.
        $cost = $this->menu([
            'key' => 'dashboard-cost',
            'title' => 'Cost',
            'route' => 'dashboard.cost',
            'icon' => 'Receipt',
            'area' => 'reporting',
            'sort_order' => 5,
            'is_active' => false,
        ]);

        $analytics = $this->menu([
            'key' => 'analytics',
            'title' => 'Analisa',
            'route' => 'analytics.index',
            'icon' => 'BarChart3',
            'area' => 'reporting',
            'sort_order' => 6,
            'is_active' => false,
        ]);

        // TRIAL: product-level P&L (Colarose/Boneguard) — tmp_ tables.
        $productAnalysis = $this->menu([
            'key' => 'dashboard-product',
            'title' => 'Analisa Produk',
            'route' => 'dashboard.product',
            'icon' => 'FlaskConical',
            'area' => 'reporting',
            'sort_order' => 7,
            'is_active' => false,
        ]);

        // Dashboard eksekutif Purchasing: spending per principal, status PR/PO, lead time,
        // utang & CN principal, analisa biaya impor.
        $this->menu([
            'key' => 'dashboard-purchasing',
            'title' => 'Purchasing',
            'route' => 'dashboard.purchasing',
            'icon' => 'ShoppingCart',
            'area' => 'reporting',
            'sort_order' => 4,
        ]);

        // Pivot Data Penjualan tidak punya menu sendiri — diakses via kartu shortcut di
        // dashboard Sales dan ikut gate `dashboard`. Hapus menu lama bila pernah ter-seed
        // (cascade role_menu) agar tidak muncul di top nav.
        Menu::where('key', 'pivot-explorer')->delete();

        // Beranda (self-service) lives in the BACKEND area, not the BOD front dashboard.
        $this->menu([
            'key' => 'my-dashboard',
            'title' => 'Beranda',
            'route' => 'beranda',
            'icon' => 'House',
            'area' => 'backend',
            'sort_order' => 1,
        ]);

        // Module: Sales (backend) — input & data penjualan oleh tim sales.
        // Menyusul: Database Rumah Sakit & Database Dokter (sync Dolibarr).
        $sales = $this->menu([
            'key' => 'sales',
            'title' => 'Sales',
            'route' => null,
            'icon' => 'HandCoins',
            'sort_order' => 2,
        ]);
        $this->menu(['key' => 'sales-daily', 'title' => 'Sales Daily', 'route' => 'sales-daily.index', 'icon' => 'ClipboardList', 'sort_order' => 1], $sales->id);
        $this->menu(['key' => 'sales-hospitals', 'title' => 'Database Rumah Sakit', 'route' => 'sales-hospitals.index', 'icon' => 'Building2', 'sort_order' => 2], $sales->id);
        $this->menu(['key' => 'sales-doctors', 'title' => 'Database Dokter', 'route' => 'sales-doctors.index', 'icon' => 'Stethoscope', 'sort_order' => 3], $sales->id);

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
        $this->menu(['key' => 'attendance-recap', 'title' => 'Rekap Kehadiran', 'route' => 'attendance.recap', 'icon' => 'ClipboardCheck', 'sort_order' => 3], $attendance->id);

        // Sub-module: Cuti (Leave Management).
        $leave = $this->menu(['key' => 'leave', 'title' => 'Cuti', 'route' => null, 'icon' => 'CalendarDays', 'sort_order' => 3], $hr->id);
        $this->menu(['key' => 'leave-mine', 'title' => 'Cuti Saya', 'route' => 'leave.index', 'icon' => 'CalendarDays', 'sort_order' => 1], $leave->id);
        $this->menu(['key' => 'leave-approvals', 'title' => 'Persetujuan Cuti', 'route' => 'leave.approvals.index', 'icon' => 'Inbox', 'sort_order' => 2], $leave->id);

        // Sub-module: Kelola Cuti (Admin/HR).
        $leaveAdmin = $this->menu(['key' => 'leave-admin', 'title' => 'Kelola Cuti', 'route' => null, 'icon' => 'Settings', 'sort_order' => 4], $hr->id);
        $this->menu(['key' => 'leave-admin-requests', 'title' => 'Semua Pengajuan', 'route' => 'leave.admin.requests', 'icon' => 'Inbox', 'sort_order' => 1], $leaveAdmin->id);
        $this->menu(['key' => 'leave-admin-balances', 'title' => 'Saldo Karyawan', 'route' => 'leave.admin.balances', 'icon' => 'Wallet', 'sort_order' => 2], $leaveAdmin->id);

        // Sub-module: Lembur (Overtime).
        $overtime = $this->menu(['key' => 'overtime', 'title' => 'Lembur', 'route' => null, 'icon' => 'Timer', 'sort_order' => 5], $hr->id);
        $this->menu(['key' => 'overtime-mine', 'title' => 'Lembur Saya', 'route' => 'overtime.index', 'icon' => 'Timer', 'sort_order' => 1], $overtime->id);
        $this->menu(['key' => 'overtime-approvals', 'title' => 'Persetujuan Lembur', 'route' => 'overtime.approvals.index', 'icon' => 'Inbox', 'sort_order' => 2], $overtime->id);

        // Sub-module: Kelola Lembur (Admin/HR).
        $overtimeAdmin = $this->menu(['key' => 'overtime-manage', 'title' => 'Kelola Lembur', 'route' => null, 'icon' => 'Wallet', 'sort_order' => 6], $hr->id);
        $this->menu(['key' => 'overtime-admin', 'title' => 'Pengajuan Lembur', 'route' => 'overtime.admin.index', 'icon' => 'Inbox', 'sort_order' => 1], $overtimeAdmin->id);

        // Sub-module: Attend Case (read from ERP).
        $attendCase = $this->menu(['key' => 'attend-case', 'title' => 'Attend Case', 'route' => null, 'icon' => 'Stethoscope', 'sort_order' => 7], $hr->id);
        $this->menu(['key' => 'attend-mine', 'title' => 'Attend Case Saya', 'route' => 'attend-case.mine', 'icon' => 'Stethoscope', 'sort_order' => 1], $attendCase->id);
        $this->menu(['key' => 'attend-admin', 'title' => 'Rekap Attend Case', 'route' => 'attend-case.admin', 'icon' => 'Inbox', 'sort_order' => 2], $attendCase->id);

        // Consolidated settings page (absensi, lembur, jenis cuti, hari libur, fee attend case).
        $this->menu(['key' => 'hr-settings', 'title' => 'Pengaturan Kepegawaian', 'route' => 'hr-settings.index', 'icon' => 'SlidersHorizontal', 'sort_order' => 8], $hr->id);

        // Retire menus superseded by the consolidated Pengaturan page (cascades role_menu).
        Menu::whereIn('key', ['leave-types', 'leave-holidays', 'overtime-setting'])->delete();

        // Module: Finance.
        $finance = $this->menu(['key' => 'finance', 'title' => 'Finance', 'route' => null, 'icon' => 'Landmark', 'sort_order' => 5]);

        // Retire the old pricing engine menus (routes removed) — prevents a Ziggy "route not in
        // list" crash (blank screen) when a stale menu points to a deleted route. Cascades role_menu.
        Menu::whereIn('key', ['pricing-approvals', 'finance-products', 'pricing-engine-v2'])->delete();

        // Sub-modul: Pricing — seluruh fungsi harga (engine → mata uang) di bawah satu grup.
        $pricing = $this->menu(['key' => 'pricing', 'title' => 'Pricing', 'route' => null, 'icon' => 'Tags', 'sort_order' => 1], $finance->id);
        $this->menu(['key' => 'pricing-engine', 'title' => 'Pricing Engine', 'route' => 'pricing-engine.index', 'icon' => 'Calculator', 'sort_order' => 1], $pricing->id);
        $this->menu(['key' => 'pricing-approval', 'title' => 'Persetujuan Harga', 'route' => 'pricing-approval.index', 'icon' => 'BadgeCheck', 'sort_order' => 2], $pricing->id);
        $this->menu(['key' => 'pricelist', 'title' => 'Pricelist', 'route' => 'pricelist.index', 'icon' => 'ListChecks', 'sort_order' => 3], $pricing->id);
        $this->menu(['key' => 'pricing-profiles', 'title' => 'Kelola Profil', 'route' => 'pricing-profiles.index', 'icon' => 'SlidersHorizontal', 'sort_order' => 4], $pricing->id);
        $this->menu(['key' => 'currencies', 'title' => 'Kelola Mata Uang', 'route' => 'currencies.index', 'icon' => 'Coins', 'sort_order' => 5], $pricing->id);

        // Module: Integrasi Data.
        $integrasi = $this->menu([
            'key' => 'integrasi-data',
            'title' => 'Integrasi Data',
            'route' => null,
            'icon' => 'DatabaseZap',
            'sort_order' => 6,
        ]);
        // Sub-module: ERP (Dolibarr) — Sales + Stok dipisah agar paginasi tidak bentrok.
        $erp = $this->menu(['key' => 'erp', 'title' => 'ERP', 'route' => null, 'icon' => 'Database', 'sort_order' => 1], $integrasi->id);
        $this->menu(['key' => 'erp-setting', 'title' => 'Setting', 'route' => 'erp.settings', 'icon' => 'Settings', 'sort_order' => 1], $erp->id);
        $this->menu(['key' => 'data-integration', 'title' => 'Sales', 'route' => 'integration.index', 'icon' => 'ShoppingCart', 'sort_order' => 2], $erp->id);
        $this->menu(['key' => 'erp-stock', 'title' => 'Stok', 'route' => 'integration.stock', 'icon' => 'Boxes', 'sort_order' => 3], $erp->id);

        // Sub-module: Accurate (menu lain menyusul).
        $accurate = $this->menu(['key' => 'accurate', 'title' => 'Accurate', 'route' => null, 'icon' => 'Plug', 'sort_order' => 2], $integrasi->id);
        $this->menu(['key' => 'accurate-setting', 'title' => 'Setting', 'route' => 'accurate.settings', 'icon' => 'Settings', 'sort_order' => 1], $accurate->id);
        $this->menu(['key' => 'accurate-sales', 'title' => 'Penjualan', 'route' => 'accurate.sales', 'icon' => 'ShoppingCart', 'sort_order' => 2], $accurate->id);
        $this->menu(['key' => 'accurate-staging', 'title' => 'Staging Data', 'route' => 'accurate.staging', 'icon' => 'Database', 'sort_order' => 3], $accurate->id);
        $this->menu(['key' => 'accurate-stock', 'title' => 'Stok', 'route' => 'accurate.stock', 'icon' => 'Boxes', 'sort_order' => 4], $accurate->id);

        // Sub-module: Hadirr (attendance).
        $hadirr = $this->menu(['key' => 'hadirr', 'title' => 'Hadirr', 'route' => null, 'icon' => 'Fingerprint', 'sort_order' => 3], $integrasi->id);
        $this->menu(['key' => 'hadirr-setting', 'title' => 'Setting', 'route' => 'hadirr.settings', 'icon' => 'Settings', 'sort_order' => 1], $hadirr->id);

        // Stock reconciliation ERP vs Accurate (own leaf under Integrasi Data).
        $this->menu(['key' => 'stock-recon', 'title' => 'Rekon Data Stok', 'route' => 'stock.recon', 'icon' => 'Layers', 'sort_order' => 4], $integrasi->id);

        // 3-way reconciliation: ERP vs Accurate vs physical stocktake.
        $this->menu(['key' => 'stocktake-recon', 'title' => 'Rekon vs Stocktake', 'route' => 'stocktake.recon', 'icon' => 'ClipboardCheck', 'sort_order' => 5], $integrasi->id);

        // Monitoring Pembelian — total per principal per tahun (Accurate) + rekon Dolibarr.
        $this->menu(['key' => 'purchase-monitor', 'title' => 'Monitoring Pembelian', 'route' => 'purchase-monitor.index', 'icon' => 'ShoppingCart', 'sort_order' => 6], $integrasi->id);

        // Sync job log (ERP / Accurate / Hadirr).
        $this->menu(['key' => 'sync-logs', 'title' => 'Log Sinkronisasi', 'route' => 'integration.logs', 'icon' => 'ScrollText', 'sort_order' => 7], $integrasi->id);

        // Sub-modul: Data Warehouse (kini di bawah Integrasi Data) — sumber data terpadu (dwh_*)
        // + unggah manual (GL). Sementara isinya hanya Pipeline Data; klasifikasi/pemetaan biaya
        // pindah ke modul Cost Control.
        $dwh = $this->menu([
            'key' => 'data-warehouse',
            'title' => 'Data Warehouse',
            'route' => null,
            'icon' => 'Warehouse',
            'sort_order' => 7,
        ], $integrasi->id);
        $this->menu(['key' => 'dwh-pipeline', 'title' => 'Pipeline Data', 'route' => 'dwh.pipeline', 'icon' => 'DatabaseZap', 'sort_order' => 1], $dwh->id);

        // Module: Cost Control — klasifikasi GL & pembebanan biaya (dulu di bawah Data Warehouse).
        $costControl = $this->menu([
            'key' => 'cost-control',
            'title' => 'Cost Control',
            'route' => null,
            'icon' => 'Coins',
            'sort_order' => 8,
        ]);
        $this->menu(['key' => 'dwh-gl-classification', 'title' => 'Klasifikasi GL', 'route' => 'dwh.gl-classification', 'icon' => 'ListTree', 'sort_order' => 1], $costControl->id);
        $this->menu(['key' => 'dwh-cost-mapping', 'title' => 'Pemetaan Biaya (ABC)', 'route' => 'dwh.cost-mapping', 'icon' => 'SlidersHorizontal', 'sort_order' => 2], $costControl->id);

        // Grant the Reporting role view access to the dashboard + analytics only.
        $reporting = Role::where('slug', 'reporting')->first();
        if ($reporting) {
            $reporting->menus()->syncWithoutDetaching([
                $dashboard->id => ['can_view' => true],
                $finance->id => ['can_view' => true],
                $stock->id => ['can_view' => true],
                $cost->id => ['can_view' => true],
                $analytics->id => ['can_view' => true],
                $productAnalysis->id => ['can_view' => true],
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
                'is_active' => $attributes['is_active'] ?? true,
            ],
        );
    }
}
