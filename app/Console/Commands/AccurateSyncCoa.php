<?php

namespace App\Console\Commands;

use App\Models\SyncLog;
use App\Services\Accurate\AccurateSyncService;
use Illuminate\Console\Command;

/**
 * Tarik Chart of Accounts (COA) Accurate → dwh_stg_acc_glaccount.
 *
 * COA memberi account_type (REVENUE/COGS/EXPENSE/…) & parent — fondasi tab Cost dan
 * ABC costing. Endpoint glaccount/list.do TIDAK diblokir. Sebelumnya syncGlAccounts()
 * tak punya trigger CLI (hanya dipanggil manual), jadi mudah terlupa di server baru.
 */
class AccurateSyncCoa extends Command
{
    protected $signature = 'accurate:sync-coa';

    protected $description = 'Tarik Chart of Accounts Accurate ke dwh_stg_acc_glaccount';

    public function handle(AccurateSyncService $svc): int
    {
        $started = microtime(true);
        $this->info('Menarik COA dari Accurate…');

        try {
            $result = $svc->syncGlAccounts(fn (string $m) => $this->line('  '.$m));
        } catch (\Throwable $e) {
            SyncLog::record('dwh', 'Sync COA Accurate', 'error', [], mb_substr($e->getMessage(), 0, 200),
                (int) ((microtime(true) - $started) * 1000), 'manual');
            $this->error('Gagal: '.$e->getMessage());

            return self::FAILURE;
        }

        $ms = (int) ((microtime(true) - $started) * 1000);
        SyncLog::record('dwh', 'Sync COA Accurate', 'success', $result, null, $ms, 'manual');
        $this->info(sprintf('Selesai (%.1fs): %d akun.', $ms / 1000, $result['accounts'] ?? 0));

        return self::SUCCESS;
    }
}
