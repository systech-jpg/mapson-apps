<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/**
 * Isi dwh_fx_rate dengan kurs historis → IDR per bulan dari sumber eksternal (Frankfurter,
 * gratis tanpa kunci). Ini mewujudkan "trace kurs pada tanggal transaksi" — sumbernya API
 * publik, bukan dokumen pembelian (Accurate tak menyimpan kurs; Dolibarr mencatatnya 1,0).
 *
 * Kurs yang ditandai source='manual' hanya ditimpa bila --overwrite diberikan, agar kurs yang
 * sudah kamu tetapkan sendiri tidak tergerus.
 */
class FetchFxRates extends Command
{
    protected $signature = 'fx:fetch
        {--from= : Bulan awal YYYY-MM (default: bulan terlama di pembelian)}
        {--to= : Bulan akhir YYYY-MM (default: bulan terbaru di pembelian)}
        {--currency=USD : Mata uang asing yang diambil (→ IDR)}
        {--overwrite : Timpa juga kurs yang sebelumnya diisi manual}';

    protected $description = 'Ambil kurs historis → IDR per bulan dari API publik ke dwh_fx_rate';

    public function handle(): int
    {
        $currency = strtoupper((string) $this->option('currency'));
        [$from, $to] = $this->range();
        $this->info("Mengambil kurs {$currency}→IDR, {$from->format('Y-m')} s/d {$to->format('Y-m')}…");

        $ok = 0;
        $fail = 0;
        for ($m = $from->copy(); $m <= $to; $m->addMonth()) {
            $period = $m->format('Y-m');
            $rate = $this->rateFor($currency, $m);

            if ($rate === null) {
                $this->warn("  {$period}: gagal ambil kurs, dilewati.");
                $fail++;

                continue;
            }

            // Jangan gerus kurs manual kecuali diminta.
            $exists = DB::table('dwh_fx_rate')->where('currency', $currency)->where('period', $period)->first();
            if ($exists && $exists->source === 'manual' && ! $this->option('overwrite')) {
                $this->line("  {$period}: {$rate} (dilewati, ada kurs manual)");

                continue;
            }

            DB::table('dwh_fx_rate')->updateOrInsert(
                ['currency' => $currency, 'period' => $period],
                ['rate_to_idr' => $rate, 'source' => 'external', 'note' => 'Frankfurter '.$m->format('Y-m-01'), 'updated_at' => now(), 'created_at' => now()],
            );
            $this->line("  {$period}: {$rate}");
            $ok++;
        }

        $this->info("Selesai: {$ok} kurs diperbarui, {$fail} gagal.");

        return $fail > 0 && $ok === 0 ? self::FAILURE : self::SUCCESS;
    }

    /** Kurs rata-rata bulan (pakai tanggal 1 tiap bulan sebagai acuan). Null bila API gagal. */
    protected function rateFor(string $currency, Carbon $month): ?float
    {
        try {
            $resp = Http::timeout(15)->retry(2, 500)
                ->get('https://api.frankfurter.app/'.$month->format('Y-m-01'), ['from' => $currency, 'to' => 'IDR']);

            $rate = $resp->json('rates.IDR');

            return is_numeric($rate) ? (float) $rate : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /** @return array{0: Carbon, 1: Carbon} */
    protected function range(): array
    {
        $rng = DB::table('dwh_stg_acc_purchase_invoice_item')->selectRaw('MIN(trans_date) mn, MAX(trans_date) mx')->first();
        $from = $this->option('from')
            ? Carbon::createFromFormat('Y-m', $this->option('from'))->startOfMonth()
            : Carbon::parse($rng->mn ?? now())->startOfMonth();
        $to = $this->option('to')
            ? Carbon::createFromFormat('Y-m', $this->option('to'))->startOfMonth()
            : Carbon::parse($rng->mx ?? now())->startOfMonth();

        return [$from, $to];
    }
}
