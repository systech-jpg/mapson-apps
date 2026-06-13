<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_attachments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('leave_request_id')->constrained('leave_requests')->cascadeOnDelete();
            $t->string('original_name');
            $t->string('path');                               // disk privat 'local'
            $t->string('mime', 100)->nullable();
            $t->unsignedBigInteger('size')->nullable();
            $t->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();

            $t->index('leave_request_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_attachments');
    }
};
