<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('overtime_approvals', function (Blueprint $t) {
            $t->id();
            $t->foreignId('overtime_period_id')->constrained('overtime_periods')->cascadeOnDelete();
            $t->unsignedTinyInteger('level');
            $t->enum('role', ['supervisor', 'hr']);
            $t->foreignId('approver_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $t->enum('status', ['pending', 'approved', 'rejected', 'skipped'])->default('pending');
            $t->string('notes')->nullable();
            $t->timestamp('acted_at')->nullable();
            $t->timestamps();

            $t->unique(['overtime_period_id', 'level']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('overtime_approvals');
    }
};
