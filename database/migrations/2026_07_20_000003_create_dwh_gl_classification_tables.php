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

        $capex = $insert(null, 'CAPEX', 'CapEx', 'capex');
        foreach (['cx-gedung' => 'Gedung', 'cx-kendaraan' => 'Kendaraan', 'cx-rak' => 'Rak Gudang', 'cx-software' => 'Software'] as $c => $n) {
            $insert($capex, $c, $n, 'capex');
        }

        $opex = $insert(null, 'OPEX', 'OpEx', 'opex');
        foreach ([
            'ox-procurement' => 'Procurement', 'ox-warehouse' => 'Warehouse', 'ox-logistics' => 'Logistics',
            'ox-sales' => 'Sales', 'ox-service' => 'Service', 'ox-finance' => 'Finance', 'ox-hr' => 'HR', 'ox-it' => 'IT',
        ] as $c => $n) {
            $insert($opex, $c, $n, 'opex');
        }
        $corp = $insert($opex, 'ox-corporate', 'Corporate / Management', 'opex');
        foreach ([
            'ox-corp-dir' => 'Gaji Direktur', 'ox-corp-kom' => 'Gaji Komisaris', 'ox-corp-sek' => 'Sekretaris Direksi',
            'ox-corp-bod' => 'Meeting BOD', 'ox-corp-legal' => 'Legal', 'ox-corp-audit' => 'Audit',
            'ox-corp-ir' => 'Investor Relation', 'ox-corp-tax' => 'Corporate Tax Consulting',
        ] as $c => $n) {
            $insert($corp, $c, $n, 'opex');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('dwh_map_gl_classification');
        Schema::dropIfExists('dwh_dim_gl_category');
    }
};
