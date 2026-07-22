<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SyncLog;
use App\Services\Dwh\GlImportService;
use App\Services\Dwh\GlMappingRepair;
use App\Support\InventorySnapshot;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Data Warehouse — pantau sumber data yang ditarik & kelola yang diunggah manual.
 *
 * Logging memakai sync_logs yang sudah ada (channel 'dwh') — tanpa tabel log baru.
 */
class DataWarehouseController extends Controller
{
    public function pipeline(): Response
    {
        return Inertia::render('data-warehouse/pipeline', [
            'sources' => $this->sources(),
            'glPeriods' => $this->glPeriods(),
            // Template dibangun dari spesifikasi importer itu sendiri, jadi tak bisa menyimpang.
            'glTemplate' => GlImportService::templateSpec(),
            'logs' => SyncLog::query()->latest('created_at')->limit(15)->get()
                ->map(fn ($l) => [
                    'id' => $l->id,
                    'channel' => $l->channel,
                    'source' => $l->source,
                    'status' => $l->status,
                    'rows' => $l->rows,
                    'message' => $l->message,
                    'at' => $l->created_at?->format('d M Y H:i'),
                ]),
        ]);
    }

    /**
     * Ringkasan tiap sumber: otomatis (ditarik) vs manual (diunggah).
     *
     * @return array<int, array<string, mixed>>
     */
    protected function sources(): array
    {
        $snapDates = count(InventorySnapshot::dates(InventorySnapshot::ERP));
        $accDates = count(InventorySnapshot::dates(InventorySnapshot::ACCURATE));
        $last = fn (string $channel) => SyncLog::where('channel', $channel)->latest('created_at')->first()?->created_at?->format('d M Y H:i');

        return [
            [
                'key' => 'erp-sales', 'nama' => 'ERP — Penjualan (sales_facts)', 'mode' => 'otomatis',
                'baris' => (int) DB::table('sales_facts')->count(),
                'ket' => 'Ditarik penuh tiap malam dari Dolibarr.',
                'terakhir' => $last('erp'),
            ],
            [
                'key' => 'erp-stock', 'nama' => 'ERP — Snapshot Stok', 'mode' => 'otomatis',
                'baris' => (int) InventorySnapshot::erp()->count(),
                'ket' => $snapDates.' tanggal riwayat — bisa di-backfill mundur (dwh:backfill-stock).',
                'terakhir' => InventorySnapshot::latestDate(InventorySnapshot::ERP),
            ],
            [
                'key' => 'acc-stock', 'nama' => 'Accurate — Snapshot Stok', 'mode' => 'otomatis',
                'baris' => (int) InventorySnapshot::latest(InventorySnapshot::ACCURATE)->count(),
                'ket' => $accDates.' tanggal — saldo live, hanya bisa maju (tak bisa backfill).',
                'terakhir' => InventorySnapshot::latestDate(InventorySnapshot::ACCURATE),
            ],
            [
                'key' => 'acc-mov', 'nama' => 'Accurate — Mutasi Stok', 'mode' => 'otomatis',
                'baris' => (int) DB::table('acc_stock_movements')->count(),
                'ket' => 'Ledger per dokumen (DO/RI/SR/PR/IA/SI/PI).',
                'terakhir' => $last('accurate'),
            ],
            [
                'key' => 'gl', 'nama' => 'Accurate — Buku Besar (GL)', 'mode' => 'manual',
                'baris' => (int) DB::table('dwh_stg_gl')->count(),
                'ket' => 'Endpoint jurnal Accurate diblokir hak akses → diunggah dari laporan Histori Buku Besar.',
                'terakhir' => DB::table('dwh_stg_gl')->max('imported_at'),
            ],
        ];
    }

    /**
     * Periode GL yang sudah diunggah + cek keseimbangan debit/kredit tiap periode.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function glPeriods(): array
    {
        return DB::table('dwh_stg_gl')
            ->selectRaw('period, COUNT(*) `rows`, COUNT(DISTINCT account_code) accounts,
                SUM(debit) debit, SUM(credit) credit, SUM(amount) balance,
                MAX(imported_at) imported_at, MAX(source_file) source_file, MAX(branch) branch')
            ->groupBy('period')->orderByDesc('period')->get()
            ->map(fn ($r) => [
                'period' => $r->period,
                'rows' => (int) $r->rows,
                'accounts' => (int) $r->accounts,
                'debit' => (float) $r->debit,
                'credit' => (float) $r->credit,
                'balance' => (float) $r->balance,
                'seimbang' => abs((float) $r->balance) < 1,
                'imported_at' => $r->imported_at,
                'source_file' => $r->source_file,
                'branch' => $r->branch,
            ])->all();
    }

    /** Terima baris mentah hasil parse SheetJS di browser; seluruh penafsiran di server. */
    public function uploadGl(Request $request, GlImportService $svc, GlMappingRepair $repair): RedirectResponse
    {
        $data = $request->validate([
            'file_name' => ['required', 'string', 'max:255'],
            'rows' => ['required', 'array', 'min:2'],
        ]);

        $t = microtime(true);
        try {
            $r = $svc->import($data['rows'], $data['file_name'], $request->user()?->id);
        } catch (\Throwable $e) {
            SyncLog::record('dwh', 'Upload Buku Besar', 'failed', null, $e->getMessage(),
                (int) ((microtime(true) - $t) * 1000), 'manual', $request->user()?->id);

            return back()->with('error', 'Gagal impor: '.$e->getMessage());
        }

        // SyncLog::record() menjumlahkan SEMUA nilai numerik pada array menjadi kolom `rows`,
        // jadi nilai uang harus dikirim sebagai string — kalau tidak, debit+kredit (miliaran)
        // ikut terjumlah dan meluap dari kolom integer.
        // Impor menimpa satu periode penuh, sehingga baris yang isinya berubah memutus mapping
        // klasifikasinya (hash ikut berubah). Sambungkan kembali lewat kunci alami SEKARANG juga,
        // supaya klasifikasi manual tidak diam-diam menghilang.
        $fix = $repair->relink();

        $seimbang = abs($r['balance']) < 1;
        SyncLog::record('dwh', 'Upload Buku Besar '.$r['period'], $seimbang ? 'success' : 'partial', [
            'rows' => $r['rows'],
            'akun' => (string) $r['accounts'],
            'debit' => number_format($r['debit'], 2, ',', '.'),
            'kredit' => number_format($r['credit'], 2, ',', '.'),
            'selisih' => number_format($r['balance'], 2, ',', '.'),
            'menimpa' => (string) $r['replaced'],
            'mapping_disambung' => (string) $fix['relinked'],
            'mapping_terputus' => (string) $fix['unresolved'],
            'file' => $r['period'].' — '.mb_substr($data['file_name'], 0, 80),
        ], $seimbang ? null : 'Debit−Kredit tidak seimbang: '.number_format($r['balance'], 2, ',', '.'),
            (int) ((microtime(true) - $t) * 1000), 'manual', $request->user()?->id);

        $msg = "Periode {$r['period']}: {$r['rows']} baris, {$r['accounts']} akun";
        $msg .= $r['replaced'] ? " (menimpa {$r['replaced']} baris lama)." : '.';
        if ($fix['relinked'] > 0) {
            $msg .= " {$fix['relinked']} mapping klasifikasi disambungkan ulang otomatis.";
        }
        if ($fix['unresolved'] > 0) {
            $msg .= " PERHATIAN: {$fix['unresolved']} mapping masih terputus — tinjau di halaman Klasifikasi GL.";
        }
        if (! $seimbang) {
            $msg .= ' PERHATIAN: debit−kredit = '.number_format($r['balance'], 2, ',', '.').' (tidak seimbang).';
        }

        return back()->with('success', $msg);
    }

    public function destroyGlPeriod(string $period): RedirectResponse
    {
        $n = DB::table('dwh_stg_gl')->where('period', $period)->delete();

        return back()->with('success', "Periode {$period} dihapus ({$n} baris).");
    }
}
