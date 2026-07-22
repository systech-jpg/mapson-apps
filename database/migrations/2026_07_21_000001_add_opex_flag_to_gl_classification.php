<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Klasifikasi GL kini mencakup SEMUA akun (bukan hanya biaya). Dua penyesuaian:
 *  - category_id jadi nullable → boleh menandai flag tanpa (atau sebelum) memilih kategori.
 *  - is_operational_expense → penanda terpisah dari taksonomi CapEx/OpEx, agar bisa
 *    memfilter "hanya beban operasional" (mis. Corporate/Legal/Audit/pajak badan = OpEx
 *    di taksonomi tapi BUKAN beban operasional murni).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dwh_map_gl_classification', function (Blueprint $t) {
            $t->dropForeign(['category_id']);
        });
        Schema::table('dwh_map_gl_classification', function (Blueprint $t) {
            $t->unsignedBigInteger('category_id')->nullable()->change();
            $t->foreign('category_id')->references('id')->on('dwh_dim_gl_category')->cascadeOnDelete();
            $t->boolean('is_operational_expense')->nullable()->after('category_id');
        });
    }

    public function down(): void
    {
        Schema::table('dwh_map_gl_classification', function (Blueprint $t) {
            $t->dropColumn('is_operational_expense');
        });
    }
};
