<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_approvals', function (Blueprint $t) {
            $t->id();
            $t->foreignId('leave_request_id')->constrained('leave_requests')->cascadeOnDelete();
            $t->unsignedTinyInteger('level');                 // 1..4
            $t->enum('role', ['supervisor', 'manager', 'hr', 'director']);
            $t->foreignId('approver_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $t->enum('status', ['pending', 'approved', 'rejected', 'skipped'])->default('pending');
            $t->text('notes')->nullable();
            $t->timestamp('acted_at')->nullable();
            $t->timestamps();

            $t->unique(['leave_request_id', 'level']);
            $t->index(['approver_employee_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_approvals');
    }
};
