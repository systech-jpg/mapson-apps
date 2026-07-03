<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Principals (vendors). Sourced from Dolibarr societe (fournisseur = 1); rows can also be
 * created in-app when a principal does not yet exist in the ERP (erp_societe_id null).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pricing_principals', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('erp_societe_id')->nullable()->unique();
            $t->string('name');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pricing_principals');
    }
};
