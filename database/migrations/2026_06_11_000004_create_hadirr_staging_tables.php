<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hadirr_employees', function (Blueprint $table) {
            $table->id();
            $table->string('nik')->unique();              // Hadirr key = NIK KTP
            $table->string('name')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('gender', 5)->nullable();
            $table->date('start_date')->nullable();
            $table->string('group_name')->nullable();
            // Mapping to our HR master (auto-matched by nik_ktp, fallback user email).
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('match_method')->nullable();   // nik | email | manual
            $table->dateTime('synced_at')->nullable();
        });

        Schema::create('hadirr_attendances', function (Blueprint $table) {
            $table->id();
            $table->string('nik')->index();
            $table->string('name')->nullable();
            $table->date('date')->index();
            $table->dateTime('clock_in')->nullable();
            $table->dateTime('clock_out')->nullable();
            $table->dateTime('break_at')->nullable();
            $table->dateTime('after_break_at')->nullable();
            $table->dateTime('overtime_in')->nullable();
            $table->dateTime('overtime_out')->nullable();
            $table->string('clock_in_spot')->nullable();
            $table->string('clock_out_spot')->nullable();
            $table->string('clock_in_location')->nullable();   // "lat,lng"
            $table->string('clock_out_location')->nullable();
            $table->string('status')->nullable();
            $table->string('shift_name')->nullable();
            $table->string('group_name')->nullable();
            $table->text('notes')->nullable();
            $table->dateTime('synced_at')->nullable();
            $table->unique(['nik', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hadirr_attendances');
        Schema::dropIfExists('hadirr_employees');
    }
};
