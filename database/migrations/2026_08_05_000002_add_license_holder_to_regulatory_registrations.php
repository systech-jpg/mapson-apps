<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * License holder (pemegang izin edar) per registrasi AKL. Pilihan sementara HARDCODE
 * (PT. Mapson Arya Parahita default, Asia Actual, Dwipa, Medtronic Indonesia) —
 * rencana user: nanti ditandai lewat flag di third party ERP, baru diganti lookup.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('regulatory_registrations', function (Blueprint $t) {
            $t->string('license_holder', 120)->nullable()->after('manufacturer');
        });
    }

    public function down(): void
    {
        Schema::table('regulatory_registrations', function (Blueprint $t) {
            $t->dropColumn('license_holder');
        });
    }
};
