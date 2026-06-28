<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('acc_item_stock', function (Blueprint $t) {
            // Label for which date this snapshot represents (qty is still the live balance at pull time).
            $t->date('snapshot_date')->nullable()->after('available_to_sell')->index();
        });
    }

    public function down(): void
    {
        Schema::table('acc_item_stock', fn (Blueprint $t) => $t->dropColumn('snapshot_date'));
    }
};
