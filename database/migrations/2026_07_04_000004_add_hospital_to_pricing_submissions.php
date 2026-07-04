<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pricing_submissions', function (Blueprint $t) {
            $t->foreignId('hospital_id')->nullable()->after('profile_id')->constrained('pricing_hospitals')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('pricing_submissions', function (Blueprint $t) {
            $t->dropConstrainedForeignId('hospital_id');
        });
    }
};
