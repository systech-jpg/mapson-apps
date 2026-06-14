<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('overtime_settings', function (Blueprint $t) {
            $t->id();
            $t->decimal('rate_per_hour', 12, 2)->default(0);        // tarif Rp/jam (global)
            $t->decimal('multiplier_workday', 5, 2)->default(1);    // pengali hari kerja
            $t->decimal('multiplier_holiday', 5, 2)->default(2);    // pengali akhir pekan/libur
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('overtime_settings');
    }
};
