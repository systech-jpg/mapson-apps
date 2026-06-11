<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hadirr_settings', function (Blueprint $table) {
            $table->text('auth_encoded')->nullable()->after('secret_key'); // optional pre-encoded credentials
        });
    }

    public function down(): void
    {
        Schema::table('hadirr_settings', function (Blueprint $table) {
            $table->dropColumn('auth_encoded');
        });
    }
};
