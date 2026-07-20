<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Fondasi Activity-Based Costing (cost object = PRODUK).
 *
 * dwh_dim_cost_pool      = daftar pool/aktivitas + cara pool itu mendarat ke produk.
 * dwh_map_cost_allocation = aturan alokasi akun GL → pool, dengan SPLIT % dan
 *                           BER-PERIODE (effective_from). Satu akun bisa ke banyak pool.
 *
 * INVARIANT: tiap rupiah opex tie-back GL 100% — untuk satu akun pada satu periode,
 * total pct semestinya 100 (divalidasi di aplikasi, bukan DB). Resolusi periode P =
 * ambil baris dengan effective_from <= P terbesar per (account_code).
 *
 * dwh_map_coa (lama) DIBIARKAN — masih dipakai tab Cost untuk "Kelompok Biaya"/category.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dwh_dim_cost_pool', function (Blueprint $t) {
            $t->id();
            $t->string('code')->unique();                 // storage, delivery, attend, …
            $t->string('name');
            $t->enum('cost_type', ['direct', 'indirect'])->default('indirect');
            // Cara pool mendarat ke PRODUK (driver tahap-2):
            //   direct_cost = qty terjual × HPP; qty_stock = saldo rata-rata; qty_sent/qty_used
            //   = jembatan usage_report_det; revenue = share DPP; invoice; flat.
            $t->string('product_driver')->default('revenue');
            $t->unsignedSmallInteger('sort_order')->default(0);
            $t->boolean('is_active')->default(true);
            $t->text('note')->nullable();
            $t->timestamps();
        });

        Schema::create('dwh_map_cost_allocation', function (Blueprint $t) {
            $t->id();
            $t->string('account_code')->index();          // = dwh_stg_gl.account_code
            $t->string('cost_pool_code')->index();        // = dwh_dim_cost_pool.code
            $t->decimal('pct', 7, 4)->default(100);       // porsi akun ini ke pool (0–100)
            $t->string('effective_from', 7)->default('2000-01'); // YYYY-MM, berlaku sejak
            $t->text('note')->nullable();
            $t->timestamps();

            $t->unique(['account_code', 'cost_pool_code', 'effective_from'], 'alloc_acc_pool_eff_uq');
        });

        // Seed pool sesuai desain terkunci (8 pool; v1 engine pakai storage/delivery/attend).
        $now = now();
        $pools = [
            ['hpp',        'HPP / Landed Cost',        'direct',   'direct_cost', 1, 'Harga pokok dari faktur pembelian (dwh_map_product_cost).'],
            ['storage',    'Warehouse / Storage',      'indirect', 'qty_stock',   2, 'Biaya gedung × %-gudang, dibagi qty in-stock.'],
            ['delivery',   'Delivery / Logistik',      'direct',   'qty_sent',    3, 'Kendaraan + %-gaji sopir ÷ ritase → qty_sent.'],
            ['attend',     'Attend Operasi',           'direct',   'qty_used',    4, 'Anchor Commision+Business Travell+%-gaji PS; bobot attend_case_fees → qty_used.'],
            ['sales',      'Sales & Marketing',        'indirect', 'revenue',     5, 'Entertainment, komisi, promosi + %-gaji sales → share revenue.'],
            ['finance',    'Finance & Accounting',     'indirect', 'revenue',     6, 'Bank, selisih kurs + %-gaji finance. Driver konsep = jumlah invoice.'],
            ['it',         'IT',                       'indirect', 'revenue',     7, 'Telecom/internet/software + %-gaji IT.'],
            ['management', 'Management / Admin',       'indirect', 'revenue',     8, 'Penampung overhead: gaji mgmt, pajak badan, penyusutan kantor, sisa gedung.'],
        ];
        foreach ($pools as [$code, $name, $type, $driver, $sort, $note]) {
            DB::table('dwh_dim_cost_pool')->updateOrInsert(['code' => $code], [
                'name' => $name, 'cost_type' => $type, 'product_driver' => $driver,
                'sort_order' => $sort, 'is_active' => true, 'note' => $note,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('dwh_map_cost_allocation');
        Schema::dropIfExists('dwh_dim_cost_pool');
    }
};
