<?php

namespace App\Support;

/**
 * Single source of truth for the sales_facts dimensions & measures that the
 * Pivot Explorer (and the reusable drilldown) may group / aggregate / filter by.
 *
 * Keeping the SQL expressions whitelisted here prevents column names arriving
 * from the request from ever reaching a query, and keeps PivotExplorerController
 * and DashboardController@drilldown in agreement about what a dimension means.
 */
class SalesDimensions
{
    /** Sentinel label for NULL / empty dimension values (still filterable back). */
    public const EMPTY_LABEL = '(kosong)';

    /**
     * key => [group, label, sqlExpr, sensitive]
     *
     * sqlExpr is a raw, whitelisted expression over the sales_facts row.
     */
    public const DIMS = [
        // Waktu
        'tahun' => ['Waktu', 'Tahun', 'tahun', false],
        'kuartal' => ['Waktu', 'Kuartal', "CONCAT(tahun, '-Q', QUARTER(invoice_date))", false],
        'bulan' => ['Waktu', 'Bulan', "DATE_FORMAT(invoice_date, '%Y-%m')", false],
        'minggu' => ['Waktu', 'Minggu', "DATE_FORMAT(invoice_date, '%x-W%v')", false],
        // Produk
        'merk' => ['Produk', 'Merk / Principal', 'merk', false],
        'category_1' => ['Produk', 'Kategori 1', 'category_1', false],
        'category_2' => ['Produk', 'Kategori 2', 'category_2', false],
        'category_3' => ['Produk', 'Kategori 3', 'category_3', false],
        'category_4' => ['Produk', 'Kategori 4', 'category_4', false],
        'part_number' => ['Produk', 'Part Number', 'part_number', false],
        'description' => ['Produk', 'Produk (Deskripsi)', 'description', false],
        // Customer
        'customer' => ['Customer', 'Customer / RS', 'customer', false],
        'bill_to' => ['Customer', 'Bill To', 'bill_to', false],
        'region' => ['Customer', 'Region', 'region', false],
        'doctor' => ['Customer', 'Dokter', 'doctor', true],
        'patient' => ['Customer', 'Pasien', 'patient', true],
        // Sales
        'sales' => ['Sales', 'Sales', 'sales', false],
        'sales_2' => ['Sales', 'Sales 2', 'sales_2', false],
        'team' => ['Sales', 'Team', 'team', false],
        'technical_support' => ['Sales', 'Technical Support', 'technical_support', false],
        // Status
        'paid_unpaid' => ['Status', 'Status Bayar', 'paid_unpaid', false],
        'tempo' => ['Status', 'Termin', 'tempo', false],
    ];

    /** key => [label, aggregateSqlExpr, format] where format ∈ money|qty|int|pct */
    public const MEASURES = [
        'dpp' => ['Penjualan (DPP)', 'SUM(dpp)', 'money'],
        'total' => ['Total (TTC)', 'SUM(total)', 'money'],
        'ppn' => ['PPN', 'SUM(ppn)', 'money'],
        'disc_value' => ['Nilai Diskon', 'SUM(disc_value)', 'money'],
        'qty' => ['Kuantitas', 'SUM(COALESCE(quantity, 0))', 'qty'],
        'down_payment' => ['Uang Muka', 'SUM(down_payment)', 'money'],
        'invoices' => ['Jumlah Invoice', 'COUNT(DISTINCT invoice_no)', 'int'],
        'customers' => ['Jumlah Customer', 'COUNT(DISTINCT customer)', 'int'],
        'aov' => ['Rata-rata / Invoice', 'SUM(dpp) / NULLIF(COUNT(DISTINCT invoice_no), 0)', 'money'],
        'disc_pct' => ['Diskon %', 'SUM(disc_value) / NULLIF(SUM(dpp) + SUM(disc_value), 0) * 100', 'pct'],
    ];

    public static function isDim(string $key): bool
    {
        return array_key_exists($key, self::DIMS);
    }

    public static function isMeasure(string $key): bool
    {
        return array_key_exists($key, self::MEASURES);
    }

    public static function dimSql(string $key): string
    {
        return self::DIMS[$key][2];
    }

    public static function dimLabel(string $key): string
    {
        return self::DIMS[$key][1];
    }

    public static function isSensitive(string $key): bool
    {
        return (bool) (self::DIMS[$key][3] ?? false);
    }

    /** SELECT expression that maps NULL/'' to the sentinel label. */
    public static function dimSelect(string $key, string $alias): string
    {
        $sql = self::dimSql($key);

        return "CASE WHEN ($sql) IS NULL OR ($sql) = '' THEN '".self::EMPTY_LABEL."' ELSE ($sql) END AS $alias";
    }
}
