<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1) Decouple from users: make user_id nullable + nullOnDelete.
        Schema::table('employees', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });
        Schema::table('employees', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->nullable()->change();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });

        // 2) Personal data + snapshot + audit columns.
        Schema::table('employees', function (Blueprint $table) {
            // Personal
            $table->string('first_name')->nullable()->after('employee_code');
            $table->string('last_name')->nullable()->after('first_name');
            $table->string('full_name')->nullable()->after('last_name');
            $table->string('nik_ktp', 32)->nullable()->unique()->after('full_name');
            $table->string('npwp')->nullable()->after('nik_ktp');
            $table->enum('gender', ['male', 'female'])->nullable()->after('npwp');
            $table->string('birth_place')->nullable()->after('gender');
            $table->date('birth_date')->nullable()->after('birth_place');
            $table->enum('religion', ['islam', 'kristen', 'katolik', 'hindu', 'buddha', 'konghucu', 'lainnya'])->nullable()->after('birth_date');
            $table->enum('marital_status', ['single', 'married', 'divorced', 'widowed'])->nullable()->after('religion');
            $table->string('nationality')->default('WNI')->after('marital_status');
            $table->enum('blood_type', ['A', 'B', 'AB', 'O'])->nullable()->after('nationality');
            $table->string('bpjs_kesehatan_no')->nullable()->after('blood_type');
            $table->string('bpjs_ketenagakerjaan_no')->nullable()->after('bpjs_kesehatan_no');
            $table->string('photo_path')->nullable()->after('bpjs_ketenagakerjaan_no');

            // Snapshot of current assignment (written only by AssignmentService)
            $table->foreignId('current_company_id')->nullable()->constrained('companies')->nullOnDelete();
            $table->foreignId('current_org_unit_id')->nullable()->constrained('org_units')->nullOnDelete();
            $table->foreignId('current_position_id')->nullable()->constrained('positions')->nullOnDelete();
            $table->foreignId('current_job_catalog_id')->nullable()->constrained('job_catalogs')->nullOnDelete();
            $table->foreignId('current_job_grade_id')->nullable()->constrained('job_grades')->nullOnDelete();
            $table->foreignId('current_cost_center_id')->nullable()->constrained('cost_centers')->nullOnDelete();
            $table->foreignId('current_location_id')->nullable()->constrained('locations')->nullOnDelete();
            $table->foreignId('current_employee_group_id')->nullable()->constrained('employee_groups')->nullOnDelete();
            $table->foreignId('current_employee_subgroup_id')->nullable()->constrained('employee_subgroups')->nullOnDelete();
            $table->foreignId('current_employment_type_id')->nullable()->constrained('employment_types')->nullOnDelete();
            $table->enum('current_employment_status', ['active', 'probation', 'suspended', 'terminated', 'resigned', 'retired'])->default('active');
            $table->unsignedBigInteger('reports_to_employee_id')->nullable();
            $table->date('current_effective_date')->nullable();
            $table->date('termination_date')->nullable();

            // Audit ownership
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();

            $table->softDeletes();

            $table->index('current_org_unit_id');
            $table->index('current_position_id');
            $table->index('current_employment_status');
            $table->index('full_name');

            $table->foreign('reports_to_employee_id')->references('id')->on('employees')->nullOnDelete();
        });

        // 3) Existing department_id kept nullable for the transition (retired later).
        Schema::table('employees', function (Blueprint $table) {
            $table->unsignedBigInteger('department_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropForeign(['reports_to_employee_id']);
            foreach ([
                'current_company_id', 'current_org_unit_id', 'current_position_id', 'current_job_catalog_id',
                'current_job_grade_id', 'current_cost_center_id', 'current_location_id', 'current_employee_group_id',
                'current_employee_subgroup_id', 'current_employment_type_id', 'created_by', 'updated_by',
            ] as $col) {
                $table->dropConstrainedForeignId($col);
            }
            $table->dropColumn([
                'first_name', 'last_name', 'full_name', 'nik_ktp', 'npwp', 'gender', 'birth_place', 'birth_date',
                'religion', 'marital_status', 'nationality', 'blood_type', 'bpjs_kesehatan_no', 'bpjs_ketenagakerjaan_no',
                'photo_path', 'current_employment_status', 'reports_to_employee_id', 'current_effective_date',
                'termination_date', 'deleted_at',
            ]);
        });
    }
};
