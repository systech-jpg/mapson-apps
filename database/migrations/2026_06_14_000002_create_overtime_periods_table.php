<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('overtime_periods', function (Blueprint $t) {
            $t->id();
            $t->string('request_number', 40)->unique();           // OT-2026-000123
            $t->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $t->string('period', 7);                              // Y-m (start month)
            $t->date('period_start');                            // tgl 20
            $t->date('period_end');                              // tgl 19 bln berikutnya
            $t->enum('status', [
                'draft', 'pending_supervisor', 'pending_hr', 'approved', 'rejected',
            ])->default('draft');
            $t->unsignedTinyInteger('current_level')->default(0);
            $t->decimal('total_hours', 7, 2)->default(0);        // jumlah jam disetujui
            $t->decimal('total_amount', 14, 2)->default(0);      // nominal terhitung
            // Snapshots taken at final (HR) approval so historical periods stay accurate.
            $t->decimal('rate_per_hour', 12, 2)->nullable();
            $t->decimal('multiplier_workday', 5, 2)->nullable();
            $t->decimal('multiplier_holiday', 5, 2)->nullable();
            $t->timestamp('submitted_at')->nullable();
            $t->timestamp('decided_at')->nullable();
            $t->string('decision_note')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->softDeletes();

            $t->unique(['employee_id', 'period']);
            $t->index(['status', 'current_level']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('overtime_periods');
    }
};
