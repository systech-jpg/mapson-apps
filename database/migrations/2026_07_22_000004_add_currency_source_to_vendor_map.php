<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Penanda asal mata uang vendor: 'auto' (ditebak dari nilai baris) vs 'manual' (ditetapkan
 * pengguna). Penebakan otomatis dipicu ulang tiap "Tarik vendor baru"/sync, jadi tanpa penanda
 * ini edit manual bisa tertimpa. Baris auto boleh diperbarui; baris manual dihormati.
 *
 * Aturan tebakan (lebih baik dari rata-rata lama): mata uang vendor = USD bila MAYORITAS barisnya
 * bernilai < 600.000 (khas harga satuan USD), selain itu IDR. Diterapkan per VENDOR, bukan per
 * baris — vendor lokal IDR sah punya baris kecil (mis. sekrup Rp 576.000) yang bila dinilai USD
 * akan meledak jadi miliaran.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dwh_map_vendor_principal', function (Blueprint $t) {
            $t->enum('currency_source', ['auto', 'manual'])->default('auto')->after('default_currency');
        });

        DB::table('dwh_map_vendor_principal')->update(['currency_source' => 'auto']);
    }

    public function down(): void
    {
        Schema::table('dwh_map_vendor_principal', function (Blueprint $t) {
            $t->dropColumn('currency_source');
        });
    }
};
