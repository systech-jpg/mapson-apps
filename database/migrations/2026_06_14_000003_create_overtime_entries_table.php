<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('overtime_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('overtime_period_id')->constrained('overtime_periods')->cascadeOnDelete();
            $t->date('date');
            $t->string('activity');                              // aktivitas lembur
            $t->time('start_time');
            $t->time('end_time');
            $t->decimal('hours', 5, 2)->default(0);             // auto = end - start
            $t->boolean('is_holiday')->default(false);          // akhir pekan / hari libur
            $t->enum('status', ['pending', 'approved', 'rejected'])->default('pending'); // per-baris (atasan)
            $t->string('note')->nullable();
            $t->foreignId('decided_by')->nullable()->constrained('employees')->nullOnDelete(); // atasan
            $t->timestamp('decided_at')->nullable();
            $t->timestamps();

            $t->index(['overtime_period_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('overtime_entries');
    }
};
