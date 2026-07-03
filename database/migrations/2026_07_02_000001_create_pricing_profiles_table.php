<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pricing profiles = the parameterized sell-side preset (Nasional / E-Catalogue / Subdist).
 * Selecting a profile seeds the batch header defaults; per-row values may still override.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pricing_profiles', function (Blueprint $t) {
            $t->id();
            $t->string('code')->unique();          // nasional, e-catalogue, subdist
            $t->string('name');
            $t->unsignedSmallInteger('sort_order')->default(0);
            $t->boolean('is_active')->default(true);
            $t->unsignedInteger('rounding_step')->default(1000);   // round L to nearest step

            // Default cost rates (%) — import side.
            $t->decimal('default_bm_pct', 6, 3)->default(0);
            $t->decimal('default_pph22_pct', 6, 3)->default(0);
            $t->decimal('default_ppn_pct', 6, 3)->default(0);
            $t->decimal('default_shipment_pct', 6, 3)->default(0);

            // Default sell-side rates (%).
            $t->decimal('default_ops_pct', 6, 3)->default(0);      // D
            $t->decimal('default_profit_pct', 6, 3)->default(0);   // F
            $t->decimal('default_komisi_pct', 6, 3)->default(0);   // H
            $t->decimal('default_event_pct', 6, 3)->default(0);    // I
            $t->decimal('default_lainnya_pct', 6, 3)->default(0);  // J
            $t->decimal('default_buffer_pct', 6, 3)->default(0);   // M — max discount allowed

            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pricing_profiles');
    }
};
