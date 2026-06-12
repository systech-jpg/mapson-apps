<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE employee_educations MODIFY level ENUM('sd','smp','sma','smk','d1','d2','d3','d4','s1','s2','s3','other') NOT NULL DEFAULT 's1'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE employee_educations MODIFY level ENUM('sd','smp','sma','d3','d4','s1','s2','s3','other') NOT NULL DEFAULT 's1'");
    }
};
