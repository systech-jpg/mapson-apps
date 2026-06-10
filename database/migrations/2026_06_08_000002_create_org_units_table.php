<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('org_units', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->string('code')->nullable()->unique();
            $table->string('name');
            $table->enum('type', ['division', 'directorate', 'department', 'section', 'team'])->default('department');
            $table->unsignedTinyInteger('level')->nullable();
            $table->string('path')->nullable();
            // Deferred FKs (cost_centers / employees not created yet) — constraints added in 000012.
            $table->unsignedBigInteger('cost_center_id')->nullable();
            $table->unsignedBigInteger('manager_employee_id')->nullable();
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->index('parent_id');
            $table->index('company_id');

            $table->foreign('parent_id')->references('id')->on('org_units')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('org_units');
    }
};
