<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_settings', function (Blueprint $t) {
            // Tanggal awal periode absensi/lembur (default 20 → periode 20 s/d 19 bulan berikutnya).
            $t->unsignedTinyInteger('period_start_day')->default(20)->after('full_day_after');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_settings', function (Blueprint $t) {
            $t->dropColumn('period_start_day');
        });
    }
};
