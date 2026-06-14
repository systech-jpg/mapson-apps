<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attend_case_fees', function (Blueprint $t) {
            $t->id();
            $t->unsignedTinyInteger('tier')->unique();    // 1=Manager, 2=SPV, 3=Staff
            $t->string('label');
            $t->decimal('fee', 12, 2)->default(0);        // fee Rp per attend case
            $t->timestamps();
        });

        DB::table('attend_case_fees')->insert([
            ['tier' => 1, 'label' => 'Manager', 'fee' => 0, 'created_at' => now(), 'updated_at' => now()],
            ['tier' => 2, 'label' => 'Supervisor', 'fee' => 0, 'created_at' => now(), 'updated_at' => now()],
            ['tier' => 3, 'label' => 'Staff', 'fee' => 0, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('attend_case_fees');
    }
};
