<?php

namespace App\Console\Commands;

use App\Services\Accurate\AccurateSyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class AccurateSyncMovements extends Command
{
    protected $signature = 'accurate:sync-movements
        {from : Tanggal awal (Y-m-d)}
        {to : Tanggal akhir (Y-m-d)}
        {--types= : Subset tipe dokumen koma (DO,RI,SR,PR,IA,SI,PI), default semua}
        {--truncate : Hapus dulu mutasi tipe terpilih sebelum tarik}';

    protected $description = 'Rekonstruksi mutasi stok per-item Accurate dari dokumen (DO/RI/retur/penyesuaian/faktur langsung) ke acc_stock_movements';

    public function handle(AccurateSyncService $sync): int
    {
        $from = Carbon::parse($this->argument('from'))->format('d/m/Y');
        $to = Carbon::parse($this->argument('to'))->format('d/m/Y');
        $types = $this->option('types')
            ? array_map('trim', explode(',', strtoupper($this->option('types'))))
            : null;

        $this->info("Sinkron mutasi stok Accurate {$from} s/d {$to}…");

        try {
            $result = $sync->syncStockMovements($from, $to, $types, (bool) $this->option('truncate'), fn (string $m) => $this->line('  '.$m));
        } catch (\Throwable $e) {
            $this->error('Gagal: '.$e->getMessage());

            return self::FAILURE;
        }

        foreach ($result as $type => $r) {
            $this->line(sprintf('  %-3s : %d dokumen, %d baris', $type, $r['docs'], $r['lines']));
        }
        $this->info('Selesai.');

        return self::SUCCESS;
    }
}
