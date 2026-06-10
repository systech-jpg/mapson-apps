<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accurate_settings', function (Blueprint $table) {
            $table->text('scope')->nullable()->after('client_secret');
        });
    }

    public function down(): void
    {
        Schema::table('accurate_settings', function (Blueprint $table) {
            $table->dropColumn('scope');
        });
    }
};
