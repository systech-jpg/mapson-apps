<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Hospitals (customers). Sourced from Dolibarr societe (client = 1); rows can also be created
 * in-app. Used as an optional pricing dimension: a price with hospital_id = null is the base
 * (applies to all hospitals); a hospital-specific price overrides the base for that hospital.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pricing_hospitals', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('erp_societe_id')->nullable()->unique();
            $t->string('name');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pricing_hospitals');
    }
};
