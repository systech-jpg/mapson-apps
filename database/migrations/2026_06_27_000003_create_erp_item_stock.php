<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ERP (Dolibarr) computed stock snapshot as of a date — saldo akhir from
        // stock_mouvement + KIT explosion − usage_report (deduped). Truncate+insert.
        Schema::create('erp_item_stock', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('erp_product_id')->index();
            $t->string('ref')->nullable()->index();          // = Accurate item_no (match key)
            $t->string('label')->nullable();
            $t->string('principal')->nullable();
            $t->string('category_l2')->nullable();
            $t->decimal('buffer', 20, 2)->default(0);
            $t->decimal('qty', 20, 4)->default(0);           // saldo akhir as of snapshot_date
            $t->date('snapshot_date')->nullable()->index();
            $t->dateTime('synced_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('erp_item_stock');
    }
};
