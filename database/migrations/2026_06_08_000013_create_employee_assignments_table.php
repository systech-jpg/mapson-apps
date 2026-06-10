<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->enum('action_type', ['hire', 'transfer', 'promotion', 'demotion', 'status_change', 'reorg', 'termination'])->default('hire');

            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('org_unit_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('position_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('job_catalog_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('job_grade_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('cost_center_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('location_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('employee_group_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('employee_subgroup_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('employment_type_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('employment_status', ['active', 'probation', 'suspended', 'terminated', 'resigned', 'retired'])->default('active');
            $table->unsignedBigInteger('reports_to_employee_id')->nullable();

            $table->date('valid_from');
            $table->date('valid_to')->nullable();
            $table->boolean('is_current')->default(false);

            $table->string('reason')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['employee_id', 'is_current']);
            $table->index(['employee_id', 'valid_from']);
            $table->foreign('reports_to_employee_id')->references('id')->on('employees')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_assignments');
    }
};
