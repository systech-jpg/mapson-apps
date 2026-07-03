<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pricing_submission_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('submission_id')->constrained('pricing_submissions')->cascadeOnDelete();
            $t->foreignId('price_id')->constrained('pricing_product_prices')->cascadeOnDelete();
            $t->decimal('pricelist', 15, 2)->default(0);  // snapshot of the submitted price
            $t->string('status')->default('pending');     // pending | approved | rejected
            $t->timestamps();
            $t->unique(['submission_id', 'price_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pricing_submission_items');
    }
};
