<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A price approval submission. Head Finance (HFO) submits a batch of draft prices for one
 * principal+profile; the CEO approves/rejects (whole batch or per item). Approved prices
 * become the active pricelist.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pricing_submissions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('principal_id')->constrained('pricing_principals')->cascadeOnDelete();
            $t->foreignId('profile_id')->constrained('pricing_profiles')->cascadeOnDelete();
            $t->string('status')->default('pending');   // pending | approved | rejected | partial
            $t->text('note')->nullable();                // basis pengajuan (submitter)
            $t->text('decision_note')->nullable();       // catatan keputusan (approver)
            $t->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('submitted_at')->nullable();
            $t->timestamp('decided_at')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pricing_submissions');
    }
};
