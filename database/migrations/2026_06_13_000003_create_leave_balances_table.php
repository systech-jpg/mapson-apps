<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_balances', function (Blueprint $t) {
            $t->id();
            $t->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $t->foreignId('leave_type_id')->constrained('leave_types')->restrictOnDelete();
            $t->unsignedSmallInteger('year');
            $t->decimal('allotted', 6, 1)->default(0);       // hak tahun ini
            $t->decimal('carried_over', 6, 1)->default(0);   // bawaan tahun lalu
            $t->decimal('used', 6, 1)->default(0);           // terpakai (approved)
            $t->decimal('pending', 6, 1)->default(0);        // hold saat menunggu approval
            $t->decimal('adjustment', 6, 1)->default(0);     // koreksi HR (+/-)
            $t->timestamps();

            // available = allotted + carried_over + adjustment - used - pending (di service)
            $t->unique(['employee_id', 'leave_type_id', 'year']);
            $t->index(['employee_id', 'year']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_balances');
    }
};
