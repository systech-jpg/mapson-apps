<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * pricing_hospitals dipromosikan jadi master Rumah Sakit (menu Sales → Database Rumah
 * Sakit), diisi sync dari Dolibarr societe. `name` = name_alias (nama RS yang dikenal),
 * `legal_name` = nom (badan hukum PT/Yayasan). Baris manual tetap boleh (erp_societe_id null).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pricing_hospitals', function (Blueprint $t) {
            $t->string('legal_name')->nullable()->after('name');
            // Kode c_typent Dolibarr: MAP_CUSTPH / MAP_CUSTGO / MAP_CUSTCO / MAP_SUBDIST.
            $t->string('erp_type_code', 20)->nullable()->after('legal_name')->index();
            $t->string('code_client', 40)->nullable()->after('erp_type_code');
            $t->string('city', 100)->nullable()->after('code_client');
            $t->timestamp('synced_at')->nullable()->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('pricing_hospitals', function (Blueprint $t) {
            $t->dropColumn(['legal_name', 'erp_type_code', 'code_client', 'city', 'synced_at']);
        });
    }
};
