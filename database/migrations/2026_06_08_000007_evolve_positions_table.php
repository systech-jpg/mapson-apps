<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('positions', function (Blueprint $table) {
            $table->foreignId('company_id')->nullable()->after('id')->constrained()->nullOnDelete();
            $table->foreignId('org_unit_id')->nullable()->after('company_id')->constrained()->nullOnDelete();
            $table->foreignId('job_catalog_id')->nullable()->after('org_unit_id')->constrained()->nullOnDelete();
            $table->foreignId('job_grade_id')->nullable()->after('job_catalog_id')->constrained()->nullOnDelete();
            $table->foreignId('location_id')->nullable()->after('job_grade_id')->constrained()->nullOnDelete();
            $table->unsignedBigInteger('reports_to_position_id')->nullable()->after('location_id');
            $table->integer('headcount')->default(1)->after('reports_to_position_id');
            $table->boolean('is_vacant')->default(true)->after('headcount');
            $table->softDeletes();

            // Existing department_id kept temporarily nullable (retired in cleanup phase).
            $table->unsignedBigInteger('department_id')->nullable()->change();

            $table->index('org_unit_id');
            $table->foreign('reports_to_position_id')->references('id')->on('positions')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('positions', function (Blueprint $table) {
            $table->dropForeign(['reports_to_position_id']);
            $table->dropConstrainedForeignId('company_id');
            $table->dropConstrainedForeignId('org_unit_id');
            $table->dropConstrainedForeignId('job_catalog_id');
            $table->dropConstrainedForeignId('job_grade_id');
            $table->dropConstrainedForeignId('location_id');
            $table->dropColumn(['reports_to_position_id', 'headcount', 'is_vacant', 'deleted_at']);
        });
    }
};
