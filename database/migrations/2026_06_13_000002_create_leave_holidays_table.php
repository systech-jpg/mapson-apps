<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_holidays', function (Blueprint $t) {
            $t->id();
            $t->date('date');
            $t->string('name');
            $t->enum('type', ['national', 'collective', 'company'])->default('national');
            $t->boolean('is_workday_override')->default(false); // hari kerja pengganti
            $t->timestamps();

            $t->unique('date');
            $t->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_holidays');
    }
};
