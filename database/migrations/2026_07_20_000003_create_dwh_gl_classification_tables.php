<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Klasifikasi GL bottom-up: tempel tiap record/akun ke taksonomi CapEx/OpEx → departemen.
 *
 * Beda dari ABC (%-split top-down): ini penandaan (tagging) langsung, per akun (cepat)
 * dengan override per RECORD (untuk kasus campur seperti Renovasi di Office Maintenance,
 * atau BBM satu akun untuk sales/TS/gudang).
 *
 * Override per record memakai HASH ISI baris (bukan id) supaya bertahan saat GL di-impor
 * ulang — baris GL tak punya id stabil (idempoten per periode = hapus+tulis ulang).
 */
return new class extends Migration
{
    public function up(): void
    {
        // Taksonomi CapEx/OpEx → kategori/departemen → sub.
        Schema::create('dwh_dim_gl_category', function (Blueprint $t) {
            $t->id();
            $t->foreignId('parent_id')->nullable()->constrained('dwh_dim_gl_category')->nullOnDelete();
            $t->string('code')->unique();
            $t->string('name');
            $t->enum('kind', ['capex', 'opex']);   // diturunkan dari akar, disimpan utk query mudah
            $t->unsignedSmallInteger('sort_order')->default(0);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });

        // Penempelan: per akun (default) atau per record (override, via hash isi baris).
        Schema::create('dwh_map_gl_classification', function (Blueprint $t) {
            $t->id();
            $t->enum('scope', ['account', 'row']);
            $t->string('match_key')->index();      // account_code, atau hash baris GL
            $t->foreignId('category_id')->constrained('dwh_dim_gl_category')->cascadeOnDelete();
            $t->text('note')->nullable();
            $t->timestamps();

            $t->unique(['scope', 'match_key'], 'gl_class_scope_key_uq');
        });

        $this->seedTree();
    }

    protected function seedTree(): void
    {
        $now = now();
        $order = 0;
        $insert = function (?int $parent, string $code, string $name, string $kind) use (&$order, $now) {
            return DB::table('dwh_dim_gl_category')->insertGetId([
                'parent_id' => $parent, 'code' => $code, 'name' => $name, 'kind' => $kind,
                'sort_order' => ++$order, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
            ]);
        };

        // Taksonomi nyata yang dipakai (bukan ilustrasi awal): departemen disesuaikan dengan
        // struktur perusahaan — Purchasing, Product Specialist, dan Regulatory berdiri sendiri;
        // Warehouse & Logistic digabung; Corporate/Management tanpa anak karena pemisahan
        // gaji direksi/legal/audit dilakukan lewat override baris, bukan kategori terpisah.
        // Urutan insert SENGAJA dipertahankan agar id-nya 1–15 dan konsisten antar lingkungan.
        $capex = $insert(null, 'CAPEX', 'CAPEX', 'capex');
        foreach (['cx-gedung' => 'Gedung', 'cx-kendaraan' => 'Kendaraan', 'cx-gudang' => 'Gudang', 'cx-software' => 'Software'] as $c => $n) {
            $insert($capex, $c, $n, 'capex');
        }

        $opex = $insert(null, 'OPEX', 'OPEX', 'opex');
        foreach ([
            'ox-purchasing' => 'Purchasing', 'ox-warehouse' => 'Warehouse Logistic',
            'ox-product-spec' => 'Product Specialist', 'ox-sales' => 'Sales', 'ox-regulatory' => 'Regulatory',
            'ox-finance' => 'Finance', 'ox-hr' => 'HR', 'ox-it' => 'IT', 'ox-corporate' => 'Corporate / Management',
        ] as $c => $n) {
            $insert($opex, $c, $n, 'opex');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('dwh_map_gl_classification');
        Schema::dropIfExists('dwh_dim_gl_category');
    }
};
