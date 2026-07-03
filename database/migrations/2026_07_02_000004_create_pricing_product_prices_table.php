<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sell-side parameters + computed pricelist per (product, profile). This is the multi-profile
 * output: one product can carry a Nasional, E-Catalogue and Subdist price simultaneously.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pricing_product_prices', function (Blueprint $t) {
            $t->id();
            $t->foreignId('product_id')->constrained('pricing_products')->cascadeOnDelete();
            $t->foreignId('profile_id')->constrained('pricing_profiles')->cascadeOnDelete();

            // Sell-side rates (%) — effective values (may differ from profile defaults if overridden).
            $t->decimal('ops_pct', 6, 3)->default(0);      // D
            $t->decimal('profit_pct', 6, 3)->default(0);   // F
            $t->decimal('komisi_pct', 6, 3)->default(0);   // H
            $t->decimal('event_pct', 6, 3)->default(0);    // I
            $t->decimal('lainnya_pct', 6, 3)->default(0);  // J
            $t->decimal('buffer_pct', 6, 3)->default(0);   // M — max discount allowed
            $t->unsignedInteger('rounding_step')->default(1000);

            $t->decimal('pricelist', 15, 2)->default(0);   // L — computed, locked on approval
            $t->json('breakdown')->nullable();             // A/B/C/E/G/K snapshot

            $t->string('status')->default('draft');        // draft | pending | approved | rejected
            $t->text('note')->nullable();
            $t->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('decided_at')->nullable();

            $t->timestamps();
            $t->unique(['product_id', 'profile_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pricing_product_prices');
    }
};
