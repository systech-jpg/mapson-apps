<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Effective-dated pricelist versions. Each approval publishes a new version (effective_from =
 * approval date, effective_to = null, active). The previous active version is closed
 * (effective_to = the new approval date, is_active = false), keeping full price history.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pricing_pricelists', function (Blueprint $t) {
            $t->id();
            $t->foreignId('product_id')->constrained('pricing_products')->cascadeOnDelete();
            $t->foreignId('profile_id')->constrained('pricing_profiles')->cascadeOnDelete();
            $t->foreignId('price_id')->nullable()->constrained('pricing_product_prices')->nullOnDelete();
            $t->foreignId('submission_id')->nullable()->constrained('pricing_submissions')->nullOnDelete();

            $t->decimal('pricelist', 15, 2)->default(0);
            $t->json('breakdown')->nullable();
            $t->date('effective_from');
            $t->date('effective_to')->nullable();     // null = masih berlaku
            $t->boolean('is_active')->default(true);

            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('approved_at')->nullable();
            $t->timestamps();

            $t->index(['product_id', 'profile_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pricing_pricelists');
    }
};
