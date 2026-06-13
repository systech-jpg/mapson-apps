<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_requests', function (Blueprint $t) {
            $t->id();
            $t->string('request_number', 40)->unique();      // LR-2026-000123
            $t->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $t->foreignId('leave_type_id')->constrained('leave_types')->restrictOnDelete();
            $t->date('start_date');
            $t->date('end_date');
            $t->enum('day_part', ['full', 'first_half', 'second_half'])->default('full');
            $t->decimal('total_days', 5, 1)->default(0);     // hari efektif (exclude weekend/holiday)
            $t->time('start_time')->nullable();              // izin per jam
            $t->time('end_time')->nullable();
            $t->unsignedSmallInteger('year');                // bucket saldo (logical link)
            $t->text('reason')->nullable();
            $t->enum('status', [
                'draft', 'pending_supervisor', 'pending_manager', 'pending_hr', 'pending_director',
                'approved', 'rejected', 'withdrawn', 'cancelled', 'expired',
            ])->default('draft');
            $t->unsignedTinyInteger('current_level')->default(0);
            $t->timestamp('submitted_at')->nullable();
            $t->timestamp('decided_at')->nullable();
            $t->string('decision_note')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->softDeletes();

            $t->index(['employee_id', 'status']);
            $t->index(['status', 'current_level']);
            $t->index(['start_date', 'end_date']);
            $t->index(['leave_type_id', 'year']);
        });

        // Integrity guards (MySQL 8.0.16+ / MariaDB 10.2+ enforce; older silently ignore).
        // Skipped on sqlite (used in tests) which lacks ALTER TABLE ADD CONSTRAINT.
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE leave_requests ADD CONSTRAINT chk_lr_dates CHECK (end_date >= start_date)');
            DB::statement('ALTER TABLE leave_requests ADD CONSTRAINT chk_lr_days CHECK (total_days >= 0)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_requests');
    }
};
