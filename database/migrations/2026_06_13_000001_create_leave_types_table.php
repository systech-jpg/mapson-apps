<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_types', function (Blueprint $t) {
            $t->id();
            $t->string('code', 30)->unique();              // ANNUAL, SICK, WFH, ...
            $t->string('name');
            $t->enum('unit', ['day', 'hour'])->default('day');
            $t->boolean('is_paid')->default(true);
            $t->boolean('requires_balance')->default(true);   // false = WFH/unpaid
            $t->boolean('requires_attachment')->default(false);
            $t->boolean('allow_half_day')->default(false);
            $t->enum('gender_constraint', ['any', 'male', 'female'])->default('any');
            $t->decimal('default_quota', 5, 1)->default(0);
            $t->unsignedSmallInteger('min_notice_days')->default(0);
            $t->unsignedSmallInteger('max_consecutive_days')->nullable();
            $t->decimal('carry_over_max', 5, 1)->default(0);
            $t->unsignedTinyInteger('carry_over_expire_month')->nullable(); // 3 = expired 31 Mar
            $t->string('color', 16)->nullable();
            $t->unsignedInteger('sort_order')->default(0);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->softDeletes();

            $t->index(['is_active', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_types');
    }
};
