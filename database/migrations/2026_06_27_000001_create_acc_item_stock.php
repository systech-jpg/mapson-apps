<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Current stock snapshot per Accurate item (from item/list.do). Upsert by erp_id.
        Schema::create('acc_item_stock', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('erp_id')->unique();        // Accurate item id
            $t->string('item_no')->nullable()->index();
            $t->string('name')->nullable();
            $t->string('item_type')->nullable()->index();
            $t->decimal('unit_price', 20, 2)->default(0);
            $t->decimal('quantity', 20, 4)->default(0);          // total on-hand (all warehouses)
            $t->decimal('available_to_sell', 20, 4)->default(0);
            $t->dateTime('synced_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('acc_item_stock');
    }
};
