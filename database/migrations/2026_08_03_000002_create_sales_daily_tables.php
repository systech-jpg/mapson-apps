<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Input manual "Sales Daily" oleh tim sales — satu entri = satu kunjungan/transaksi
        // (tanggal + RS + dokter + pasien), berisi banyak baris item. Nama RS/dokter masih
        // teks bebas; nanti ditautkan ke master RS/dokter hasil sync Dolibarr (kolom *_name
        // dipertahankan sebagai snapshot).
        Schema::create('sales_daily_entries', function (Blueprint $t) {
            $t->id();
            $t->date('entry_date');
            // 'tindakan' = DTD / Tindakan (ada pasien); 'bhp' & 'unit' tanpa pasien.
            $t->enum('sales_type', ['tindakan', 'bhp', 'unit'])->default('tindakan');
            $t->string('hospital_name', 160);
            $t->string('doctor_name', 160)->nullable();
            $t->string('patient_name', 160)->nullable();
            $t->string('sales_name', 120)->nullable();
            $t->decimal('ppn_pct', 5, 2)->default(11);
            // Cache SUM(items.total) — net setelah diskon, sebelum PPN.
            $t->decimal('total_amount', 16, 2)->default(0);
            $t->string('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->softDeletes();

            $t->index(['entry_date', 'sales_type']);
        });

        Schema::create('sales_daily_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('entry_id')->constrained('sales_daily_entries')->cascadeOnDelete();
            $t->string('principal', 80)->nullable();
            $t->string('item_code', 60)->nullable();
            // "Jenis" pada sheet sales = product line/system (Creo, Solera, Zenius, ...).
            $t->string('product_line', 80)->nullable();
            $t->string('description')->nullable();
            $t->decimal('price', 14, 2)->default(0);
            $t->decimal('qty', 12, 2)->default(1);
            $t->decimal('disc_pct', 5, 2)->default(0);
            // Net = price × qty × (1 − disc/100), sebelum PPN.
            $t->decimal('total', 16, 2)->default(0);
            $t->unsignedSmallInteger('sort_order')->default(0);
            $t->timestamps();

            $t->index('item_code');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_daily_items');
        Schema::dropIfExists('sales_daily_entries');
    }
};
