<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audit of data-sync runs (ERP / Accurate / Hadirr) — one row per source per run, with the
 * outcome (success/failed), rows affected, duration, and who/what triggered it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_logs', function (Blueprint $t) {
            $t->id();
            $t->string('channel')->index();   // erp | accurate | hadirr
            $t->string('source');             // human label, e.g. "Accurate sales"
            $t->string('status')->index();    // success | failed
            $t->unsignedInteger('rows')->nullable();
            $t->text('summary')->nullable();  // json/string of the result
            $t->text('message')->nullable();  // error message when failed
            $t->unsignedInteger('duration_ms')->nullable();
            $t->string('trigger')->default('manual');   // schedule | manual
            $t->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('created_at')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_logs');
    }
};
