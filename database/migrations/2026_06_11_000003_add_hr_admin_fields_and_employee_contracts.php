<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('kk_number', 32)->nullable()->after('nik_ktp');
            $table->string('ptkp_status', 10)->nullable()->after('marital_status'); // TK/0..K/3 (status pajak)
            $table->string('bpjs_kesehatan_notes', 500)->nullable()->after('bpjs_kesehatan_no');
            $table->string('bpjs_ketenagakerjaan_notes', 500)->nullable()->after('bpjs_ketenagakerjaan_no');
        });

        Schema::create('employee_contracts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('contract_type', 20); // PKWT / PKWTT / probation
            $table->string('number')->nullable(); // No Doc PKWT/PKWTT
            $table->date('start_date');
            $table->date('end_date')->nullable(); // null = permanen
            $table->boolean('is_current')->default(false);
            $table->string('notes', 1000)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['employee_id', 'is_current']);
            $table->index(['end_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_contracts');

        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn(['kk_number', 'ptkp_status', 'bpjs_kesehatan_notes', 'bpjs_ketenagakerjaan_notes']);
        });
    }
};
