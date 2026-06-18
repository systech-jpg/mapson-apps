<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attend_case_fees', function (Blueprint $t) {
            $t->decimal('fee_workday', 12, 2)->default(0)->after('label');   // fee per case hari kerja
            $t->decimal('fee_holiday', 12, 2)->default(0)->after('fee_workday'); // fee per case tanggal merah
            $t->enum('basis', ['tindakan', 'invoice'])->default('tindakan')->after('fee_holiday');
            $t->unsignedSmallInteger('sort_order')->default(0)->after('basis');
            $t->boolean('is_active')->default(true)->after('sort_order');
        });

        // Migrate the old single `fee` into both new columns; default basis per the new model.
        DB::statement('UPDATE attend_case_fees SET fee_workday = fee, fee_holiday = fee, sort_order = tier');
        DB::statement("UPDATE attend_case_fees SET basis = 'invoice' WHERE tier IN (1, 2)");

        Schema::table('attend_case_fees', fn (Blueprint $t) => $t->dropColumn('fee'));

        // Seed a 4th tier so the default set matches the new structure (user can edit/add/remove).
        if (! DB::table('attend_case_fees')->where('tier', 4)->exists()) {
            DB::table('attend_case_fees')->insert([
                'tier' => 4, 'label' => 'Junior', 'fee_workday' => 0, 'fee_holiday' => 0,
                'basis' => 'tindakan', 'sort_order' => 4, 'is_active' => true,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('attend_case_fees', function (Blueprint $t) {
            $t->decimal('fee', 12, 2)->default(0)->after('label');
        });
        DB::statement('UPDATE attend_case_fees SET fee = fee_workday');
        Schema::table('attend_case_fees', fn (Blueprint $t) => $t->dropColumn(['fee_workday', 'fee_holiday', 'basis', 'sort_order', 'is_active']));
    }
};
