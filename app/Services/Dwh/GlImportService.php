<?php

namespace App\Services\Dwh;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Impor laporan "Histori Buku Besar" Accurate (xlsx) ke dwh_stg_gl.
 *
 * Browser hanya mengubah xlsx → array baris mentah (SheetJS); SELURUH penafsiran ada
 * di sini supaya aturannya satu tempat dan bisa diuji.
 *
 * Keanehan format laporan yang ditangani (hasil pembedahan file asli):
 *  - Kolom berjarak karena merge cell (data di kolom 1,3,5,7,9,11,13) → kolom dicari
 *    lewat LABEL header, bukan indeks tetap, supaya tahan pergeseran.
 *  - Angka dua format campur: "100,000,000." dan "339920697.7".
 *  - Ada baris footer ("ACCURATE Accounting System Report", "Tercetak pada…", "Halaman 1 dari 1").
 *  - Keterangan Jurnal boleh mengandung newline.
 *  - Tidak ada kolom Tanggal/Cabang → periode dibaca dari judul "Dari 01 Jan 2026 s/d 31 Jan 2026".
 */
class GlImportService
{
    /**
     * Penanda bahwa file masih berupa template contoh, bukan data.
     *
     * Wajib ada: impor bersifat MENIMPA per periode, jadi mengunggah template apa adanya
     * (yang berperiode contoh Januari 2026) akan MENGHAPUS data asli periode tersebut dan
     * menggantinya dengan baris contoh. Penanda ini membuat file template ditolak mentah-mentah.
     */
    public const TEMPLATE_MARKER = 'CONTOH — HAPUS SELURUH BARIS INI SEBELUM MENGUNGGAH';

    /** Nama bulan Indonesia + Inggris → nomor bulan. */
    protected const MONTHS = [
        'jan' => 1, 'feb' => 2, 'mar' => 3, 'apr' => 4, 'mei' => 5, 'may' => 5, 'jun' => 6,
        'jul' => 7, 'agu' => 8, 'aug' => 8, 'agt' => 8, 'sep' => 9, 'okt' => 10, 'oct' => 10,
        'nov' => 11, 'des' => 12, 'dec' => 12,
    ];

    /** Label header yang dicari → nama field. */
    protected const COLS = [
        'tipe transaksi jurnal' => 'trx_type',
        'no bukti' => 'doc_no',
        'kode' => 'account_code',
        'nama perkiraan' => 'account_name',
        'keterangan jurnal' => 'description',
        'debit' => 'debit',
        'kredit' => 'credit',
    ];

    /**
     * Spesifikasi template unduhan — SATU sumber kebenaran bersama importer, supaya
     * template tidak pernah menyimpang dari yang benar-benar diterima.
     *
     * Baris judul periode WAJIB: baris buku besar tidak memuat kolom tanggal, jadi
     * periode hanya bisa dibaca dari judul.
     *
     * @return array<string, mixed>
     */
    public static function templateSpec(): array
    {
        return [
            'sheet' => 'Histori Buku Besar',
            // Baris sebelum header — urutannya bebas, yang penting judul periode ada.
            'preamble' => [
                ['PT MAPSON ARYA PARAHITA'],
                ['Histori Buku Besar'],
                ['Dari 01 Jan 2026 s/d 31 Jan 2026'],  // WAJIB — sumber periode
                ['Cabang : [Semua Cabang]'],           // opsional
            ],
            'headers' => ['Tipe Transaksi Jurnal', 'No Bukti #', 'Kode #', 'Nama Perkiraan', 'Keterangan Jurnal', 'Debit', 'Kredit'],
            'marker' => self::TEMPLATE_MARKER,
            'examples' => [
                ['Pembayaran', 'PC/2026/01/00003-PA', '6110000', 'Transportation', self::TEMPLATE_MARKER.' — transport kirim barang', 43000, 0],
                ['Jurnal Umum', 'JV.2026.01.00005', '6380000', 'Toll, Gas,Parking', self::TEMPLATE_MARKER.' — topup fleet', 754000, 0],
                ['Penerimaan', 'BCA-020/26/01/00012', '8100000', 'Interest Income', self::TEMPLATE_MARKER.' — jasa giro (bersaldo kredit)', 0, 125000],
            ],
            'notes' => [
                'BAHAYA: jangan unggah file ini apa adanya. Mengunggah akan MENIMPA seluruh data periode pada judul di atas. Hapus dulu baris contoh & catatan, isi data asli.',
                'WAJIB: baris judul "Dari <tgl> <bln> <thn> s/d <tgl> <bln> <thn>" — periode dibaca dari sini karena baris buku besar tidak punya kolom tanggal.',
                'Satu file = SATU bulan. Laporan lintas-bulan ditolak.',
                'Kolom dicari berdasarkan JUDULNYA, bukan posisi — kolom kosong di antaranya (seperti export asli Accurate) aman.',
                'Kode # wajib angka. Baris yang Kode #-nya bukan angka diabaikan (judul, footer, baris kosong).',
                'Angka boleh "1,234,567." maupun 1234567.89 — keduanya terbaca.',
                'Mengunggah periode yang sama akan MENIMPA data periode itu (memang disengaja: buku yang sudah tutup masih bisa berubah).',
            ],
        ];
    }

    /**
     * @param  array<int, array<int, mixed>>  $rows  baris mentah dari SheetJS (header:1)
     * @return array{period: string, rows: int, accounts: int, debit: float, credit: float, balance: float, replaced: int, branch: ?string}
     */
    public function import(array $rows, string $fileName, ?int $userId = null): array
    {
        $this->rejectTemplate($rows);

        $meta = $this->readHeader($rows);
        $map = $this->findColumns($rows, $meta['headerRow']);

        $now = now()->toDateTimeString();
        $batch = [];
        $accounts = [];
        $debit = 0.0;
        $credit = 0.0;

        foreach (array_slice($rows, $meta['headerRow'] + 1, null, true) as $i => $r) {
            $code = trim((string) ($r[$map['account_code']] ?? ''));
            // Hanya baris dengan Kode # numerik = baris data. Ini sekaligus membuang
            // baris footer, baris kosong, dan baris pengelompokan.
            if ($code === '' || ! ctype_digit($code)) {
                continue;
            }

            $d = $this->num($r[$map['debit']] ?? null);
            $k = $this->num($r[$map['credit']] ?? null);

            $batch[] = [
                'period' => $meta['period'],
                'period_start' => $meta['start'],
                'period_end' => $meta['end'],
                'branch' => $meta['branch'],
                'trx_type' => $this->str($r[$map['trx_type']] ?? null),
                'doc_no' => $this->str($r[$map['doc_no']] ?? null),
                'account_code' => $code,
                'account_name' => $this->str($r[$map['account_name']] ?? null),
                'description' => $this->str($r[$map['description']] ?? null, 65000),
                'debit' => $d,
                'credit' => $k,
                'amount' => $d - $k,
                'row_no' => $i + 1,
                'source_file' => mb_substr($fileName, 0, 255),
                'imported_by' => $userId,
                'imported_at' => $now,
            ];

            $accounts[$code] = true;
            $debit += $d;
            $credit += $k;
        }

        if (empty($batch)) {
            throw new \RuntimeException('Tidak ada baris data yang terbaca. Pastikan file adalah laporan "Histori Buku Besar" dari Accurate.');
        }

        // Idempoten per periode: buku yang sudah "tutup" terbukti masih berubah, jadi
        // impor ulang harus MENIMPA bulan itu — bukan menumpuk.
        $replaced = DB::transaction(function () use ($meta, $batch) {
            $deleted = DB::table('dwh_stg_gl')->where('period', $meta['period'])->delete();
            foreach (array_chunk($batch, 500) as $chunk) {
                DB::table('dwh_stg_gl')->insert($chunk);
            }

            return $deleted;
        });

        return [
            'period' => $meta['period'],
            'branch' => $meta['branch'],
            'rows' => count($batch),
            'accounts' => count($accounts),
            'debit' => round($debit, 2),
            'credit' => round($credit, 2),
            'balance' => round($debit - $credit, 2),
            'replaced' => $replaced,
        ];
    }

    /**
     * Tolak file template yang diunggah apa adanya.
     *
     * Dicek SEBELUM apa pun disentuh: impor menimpa per periode, jadi template contoh
     * (berperiode Januari 2026) akan menghapus data asli periode itu bila lolos.
     *
     * @param  array<int, array<int, mixed>>  $rows
     */
    protected function rejectTemplate(array $rows): void
    {
        foreach ($rows as $r) {
            foreach ((array) $r as $cell) {
                if (is_string($cell) && str_contains($cell, self::TEMPLATE_MARKER)) {
                    throw new \RuntimeException('File ini masih berupa TEMPLATE contoh, bukan data. Hapus baris contoh & catatan, isi dengan data asli, lalu unggah lagi. (Tidak ada data yang diubah.)');
                }
            }
        }
    }

    /**
     * Baca periode + cabang dari baris judul, dan temukan baris header kolom.
     *
     * @param  array<int, array<int, mixed>>  $rows
     * @return array{period: string, start: string, end: string, branch: ?string, headerRow: int}
     */
    protected function readHeader(array $rows): array
    {
        $period = null;
        $start = null;
        $end = null;
        $branch = null;
        $headerRow = null;

        foreach (array_slice($rows, 0, 15, true) as $i => $r) {
            $line = trim(implode(' ', array_map(fn ($c) => trim((string) $c), (array) $r)));

            if ($period === null && preg_match('/Dari\s+(\d{1,2})\s+(\w+)\s+(\d{4})\s+s\/d\s+(\d{1,2})\s+(\w+)\s+(\d{4})/i', $line, $m)) {
                $start = $this->date($m[1], $m[2], $m[3]);
                $end = $this->date($m[4], $m[5], $m[6]);
                $period = Carbon::parse($start)->format('Y-m');
            }
            if ($branch === null && preg_match('/Cabang\s*:\s*(.+?)(?:,|$)/i', $line, $m)) {
                $branch = trim($m[1]) ?: null;
            }
            if ($headerRow === null && stripos($line, 'Kode') !== false && stripos($line, 'Debit') !== false) {
                $headerRow = $i;
            }
        }

        if ($headerRow === null) {
            throw new \RuntimeException('Baris header tidak ditemukan (mencari kolom "Kode #" dan "Debit"). Apakah ini laporan Histori Buku Besar?');
        }
        if ($period === null) {
            throw new \RuntimeException('Periode tidak terbaca dari judul laporan (mencari "Dari 01 Jan 2026 s/d 31 Jan 2026").');
        }

        // Laporan lintas-bulan tidak didukung: periode disimpan per bulan, sedangkan baris
        // GL tidak punya kolom tanggal — jadi bulan tiap baris tak bisa ditentukan.
        if (Carbon::parse($start)->format('Y-m') !== Carbon::parse($end)->format('Y-m')) {
            throw new \RuntimeException('Laporan mencakup lebih dari satu bulan ('.$start.' s/d '.$end.'). Export per bulan, karena baris buku besar tidak memuat kolom tanggal.');
        }

        return ['period' => $period, 'start' => $start, 'end' => $end, 'branch' => $branch, 'headerRow' => $headerRow];
    }

    /**
     * Petakan label header → indeks kolom (tahan kolom kosong akibat merge cell).
     *
     * @param  array<int, array<int, mixed>>  $rows
     * @return array<string, int>
     */
    protected function findColumns(array $rows, int $headerRow): array
    {
        $map = [];
        foreach ((array) $rows[$headerRow] as $idx => $cell) {
            $label = mb_strtolower(trim((string) $cell));
            $label = trim(str_replace('#', '', $label));
            if ($label === '') {
                continue;
            }
            foreach (self::COLS as $needle => $field) {
                if (! isset($map[$field]) && str_contains($label, $needle)) {
                    $map[$field] = $idx;
                }
            }
        }

        $missing = array_diff(array_values(self::COLS), array_keys($map));
        if ($missing) {
            throw new \RuntimeException('Kolom tidak ditemukan di header: '.implode(', ', $missing).'.');
        }

        return $map;
    }

    protected function date(string $d, string $mon, string $y): string
    {
        $key = mb_strtolower(mb_substr(trim($mon), 0, 3));
        $m = self::MONTHS[$key] ?? null;
        if (! $m) {
            throw new \RuntimeException("Nama bulan tidak dikenal: {$mon}");
        }

        return sprintf('%04d-%02d-%02d', (int) $y, $m, (int) $d);
    }

    /** "100,000,000." dan "339920697.7" sama-sama harus jadi float. */
    protected function num(mixed $v): float
    {
        if ($v === null || $v === '') {
            return 0.0;
        }
        $s = str_replace(',', '', trim((string) $v));
        $s = rtrim($s, '.');

        return is_numeric($s) ? (float) $s : 0.0;
    }

    protected function str(mixed $v, int $max = 255): ?string
    {
        $s = trim((string) ($v ?? ''));

        return $s === '' ? null : mb_substr($s, 0, $max);
    }
}
