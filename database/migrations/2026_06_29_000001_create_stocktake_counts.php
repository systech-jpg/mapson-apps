<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Physical stock-take counts, imported from the stocktake form (CSV/paste). Matched to
 * ERP product ref / Accurate item_no by `code` for 3-way reconciliation
 * (ERP vs Accurate vs Physical).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stocktake_counts', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name')->nullable();
            $table->string('principal')->nullable();
            $table->decimal('qty', 18, 2)->default(0);
            $table->string('note')->nullable();
            $table->date('counted_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stocktake_counts');
    }
};
