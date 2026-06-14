<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_settings', function (Blueprint $t) {
            $t->id();
            $t->string('deadline', 5)->default('09:00');         // batas masuk tepat waktu
            $t->string('full_day_after', 5)->default('12:00');   // masuk > ini → potong cuti 1 hari (else ½)
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_settings');
    }
};
