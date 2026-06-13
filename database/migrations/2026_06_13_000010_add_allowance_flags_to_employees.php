<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $t) {
            $t->boolean('has_meal_allowance')->default(true)->after('blood_type');       // tunjangan makan
            $t->boolean('has_transport_allowance')->default(true)->after('has_meal_allowance'); // tunjangan transport
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $t) {
            $t->dropColumn(['has_meal_allowance', 'has_transport_allowance']);
        });
    }
};
