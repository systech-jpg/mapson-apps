<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_educations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->enum('level', ['sd', 'smp', 'sma', 'd3', 'd4', 's1', 's2', 's3', 'other'])->default('s1');
            $table->string('institution');
            $table->string('major')->nullable();
            $table->integer('start_year')->nullable();
            $table->integer('end_year')->nullable();
            $table->decimal('gpa', 4, 2)->nullable();
            $table->boolean('is_highest')->default(false);
            $table->timestamps();
            $table->softDeletes();

            $table->index('employee_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_educations');
    }
};
