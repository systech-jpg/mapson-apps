<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pricing_approvals', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignUuid('product_id')->constrained('products')->cascadeOnDelete();
            $t->foreignUuid('parameter_id')->nullable()->constrained('pricing_parameters')->nullOnDelete();
            $t->decimal('old_price', 15, 2)->default(0);
            $t->decimal('new_price', 15, 2)->default(0);
            $t->json('new_values');                   // snapshot of all input modifiers
            $t->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $t->string('note')->nullable();
            $t->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('decided_at')->nullable();
            $t->timestamps();

            $t->index(['product_id', 'status']);
            $t->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pricing_approvals');
    }
};
