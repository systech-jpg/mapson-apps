<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $t) {
            // Mapping to ERP user — matches {prefix}tindakan.nama_ts / {prefix}user.rowid.
            $t->unsignedInteger('erp_user_id')->nullable()->after('has_transport_allowance')->index();
            // Attend-case fee tier: 1 = Manager, 2 = SPV, 3 = Staff.
            $t->unsignedTinyInteger('attend_tier')->nullable()->after('erp_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $t) {
            $t->dropColumn(['erp_user_id', 'attend_tier']);
        });
    }
};
