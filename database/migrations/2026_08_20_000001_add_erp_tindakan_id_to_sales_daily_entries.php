<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Penanda asal entri: id tindakan ERP yang ditarik lewat picker "Tarik dari Tindakan".
        // Dipakai untuk menyembunyikan tindakan yang sudah diinput sales dari modal picker.
        Schema::table('sales_daily_entries', function (Blueprint $t) {
            $t->unsignedBigInteger('erp_tindakan_id')->nullable()->after('sales_type')->index();
        });
    }

    public function down(): void
    {
        Schema::table('sales_daily_entries', function (Blueprint $t) {
            $t->dropIndex(['erp_tindakan_id']);
            $t->dropColumn('erp_tindakan_id');
        });
    }
};
