<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Change log for pricing_product_prices — one row per create/update/approve/reject, with the
 * field-level diff so finance can audit who changed what and when.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pricing_price_logs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('product_id')->constrained('pricing_products')->cascadeOnDelete();
            $t->foreignId('profile_id')->constrained('pricing_profiles')->cascadeOnDelete();

            $t->string('action');                       // created | updated | approved | rejected
            $t->json('changes')->nullable();            // { field: [old, new], ... }
            $t->decimal('pricelist_before', 15, 2)->nullable();
            $t->decimal('pricelist_after', 15, 2)->nullable();
            $t->text('note')->nullable();

            $t->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('created_at')->nullable();

            $t->index(['product_id', 'profile_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pricing_price_logs');
    }
};
