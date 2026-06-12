<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_bank_accounts', function (Blueprint $table) {
            $table->string('account_holder')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('employee_bank_accounts', function (Blueprint $table) {
            $table->string('account_holder')->nullable(false)->change();
        });
    }
};
