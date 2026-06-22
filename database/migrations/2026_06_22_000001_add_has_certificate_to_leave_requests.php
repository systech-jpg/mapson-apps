<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_requests', function (Blueprint $t) {
            // HR-set flag: a doctor's note (surat) exists for a sick leave — affects allowance deduction.
            $t->boolean('has_certificate')->default(false)->after('reason');
        });
    }

    public function down(): void
    {
        Schema::table('leave_requests', fn (Blueprint $t) => $t->dropColumn('has_certificate'));
    }
};
