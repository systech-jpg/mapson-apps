<?php

namespace App\Console\Commands;

use App\Services\Accurate\AccurateSyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class AccurateSyncSales extends Command
{
    protected $signature = 'accurate:sync-sales {from : Tanggal awal (Y-m-d)} {to : Tanggal akhir (Y-m-d)}';

    protected $description = 'Tarik faktur penjualan Accurate (+item, SO, DO) ke tabel staging untuk rekonsiliasi';

    public function handle(AccurateSyncService $sync): int
    {
        $from = Carbon::parse($this->argument('from'))->format('d/m/Y');
        $to = Carbon::parse($this->argument('to'))->format('d/m/Y');

        $this->info("Sinkron Accurate sales {$from} s/d {$to}…");

        try {
            $result = $sync->syncSales($from, $to, fn (string $m) => $this->line('  '.$m));
        } catch (\Throwable $e) {
            $this->error('Gagal: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info(sprintf(
            'Selesai: %d faktur, %d item, %d SO, %d DO.',
            $result['invoices'], $result['items'], $result['sales_orders'], $result['delivery_orders']
        ));

        return self::SUCCESS;
    }
}
