<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hadirr_settings', function (Blueprint $table) {
            $table->id();
            $table->string('base_url')->default('https://developer.hadirr.com/v0');
            $table->text('access_key')->nullable();    // encrypted
            $table->text('secret_key')->nullable();    // encrypted
            $table->text('access_token')->nullable();  // encrypted (cached JWT)
            $table->dateTime('token_expires_at')->nullable();
            $table->boolean('is_active')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hadirr_settings');
    }
};
