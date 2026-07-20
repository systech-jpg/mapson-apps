<?php

namespace App\Support;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Akses baca ke dwh_fact_inventory_snapshot.
 *
 * Tabel ini append-only (satu baris per source+ref+tanggal), jadi "stok sekarang"
 * = baris pada snapshot_date TERAKHIR untuk source tersebut. Semua halaman yang
 * dulu membaca erp_item_stock / acc_item_stock sekarang lewat sini supaya definisi
 * "terakhir" hanya ada di satu tempat.
 */
class InventorySnapshot
{
    public const TABLE = 'dwh_fact_inventory_snapshot';

    public const ERP = 'erp';

    public const ACCURATE = 'accurate';

    /** Tanggal snapshot terakhir untuk sebuah source (null bila belum ada data). */
    public static function latestDate(string $source): ?string
    {
        return DB::table(self::TABLE)->where('source', $source)->max('snapshot_date');
    }

    /**
     * Query baris snapshot TERAKHIR untuk sebuah source.
     * Dipakai sebagai pengganti langsung DB::table('erp_item_stock') / ('acc_item_stock').
     */
    public static function latest(string $source, ?string $asOf = null): Builder
    {
        $date = $asOf ?: self::latestDate($source);

        return DB::table(self::TABLE)
            ->where('source', $source)
            ->when($date !== null, fn ($q) => $q->where('snapshot_date', $date))
            // Bila belum ada snapshot sama sekali, kembalikan query kosong (bukan seluruh tabel).
            ->when($date === null, fn ($q) => $q->whereRaw('1 = 0'));
    }

    /** Snapshot ERP terakhir (kolom: ref, label, principal, category_l2, buffer, qty, ...). */
    public static function erp(?string $asOf = null): Builder
    {
        return self::latest(self::ERP, $asOf);
    }

    /**
     * Snapshot ERP terakhir yang BERSALDO (qty != 0) — setara persis isi tabel
     * erp_item_stock lama (dulu memfilter `HAVING qty != 0`).
     *
     * Snapshot mentah sengaja menyimpan qty = 0 untuk analisa dead stock / stok habis,
     * jadi pemakai yang butuh perilaku lama harus memakai helper ini.
     */
    public static function erpStocked(?string $asOf = null): Builder
    {
        return self::erp($asOf)->where('qty', '!=', 0);
    }

    /**
     * Snapshot Accurate terakhir, dibatasi item persediaan yang bersaldo —
     * setara filter lama `where('item_type','INVENTORY')->where('quantity','>',0)`.
     */
    public static function accurateInventory(?string $asOf = null): Builder
    {
        return self::latest(self::ACCURATE, $asOf)
            ->where('item_type', 'INVENTORY')
            ->where('qty', '>', 0);
    }

    /** Daftar tanggal snapshot yang tersedia (terbaru dulu) untuk UI riwayat. */
    public static function dates(?string $source = null): array
    {
        return DB::table(self::TABLE)
            ->when($source, fn ($q) => $q->where('source', $source))
            ->distinct()->orderByDesc('snapshot_date')
            ->pluck('snapshot_date')->all();
    }
}
