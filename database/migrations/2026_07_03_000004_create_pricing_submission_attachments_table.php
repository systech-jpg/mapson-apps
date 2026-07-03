<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pricing_submission_attachments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('submission_id')->constrained('pricing_submissions')->cascadeOnDelete();
            $t->string('kind')->default('basis');   // basis (dasar pengajuan) | proof (bukti approval)
            $t->string('path');
            $t->string('original_name');
            $t->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pricing_submission_attachments');
    }
};
