<?php

namespace App\Services\Dwh;

/**
 * Membaca memo dokumen pada baris GL menjadi daftar sub-transaksi.
 *
 * Memo voucher disalin apa adanya ke setiap baris GL, jadi satu memo bisa memuat item milik
 * beberapa akun sekaligus. Contoh nyata (dok PC/2026/03/00008, petty cash Rp 747.000):
 *
 *   Transport Maret 2026 F014 Rp 126.677 ┐
 *   Transport Maret 2026 F012 Rp  30.000 ├ = 214.977 → akun 6380000
 *   Transport Maret 2026 F016 Rp  25.000 │
 *   Transport Maret 2026 F011 Rp  33.300 ┘
 *   Transport Maret 2026 F011 Rp  55.000 ┐
 *   Kirim set zenius to Medan Rp 477.000 ┘ = 532.000 → akun 6110000
 *
 * Karena itu, setelah memo dipecah kami mencari SUBSET yang jumlahnya pas dengan nilai baris
 * agar bisa diusulkan otomatis. Bila subset yang cocok lebih dari satu, usulan ditandai ambigu
 * dan keputusan diserahkan ke pengguna.
 */
class GlDescriptionParser
{
    /** Batas aman pencarian subset (2^20 kombinasi). Di atas ini tidak diusulkan otomatis. */
    protected const MAX_ITEMS_FOR_SUBSET = 20;

    /**
     * Pecah memo menjadi item {label, amount}. Baris tanpa nominal tetap dikembalikan
     * dengan amount null supaya pengguna bisa mengisinya manual.
     *
     * @return array<int, array{label: string, amount: float|null}>
     */
    public function parse(?string $description): array
    {
        if (blank($description)) {
            return [];
        }

        // Impor GL kadang menyimpan newline sebagai literal "\n" — samakan dulu.
        $normalised = str_replace(['\\r\\n', '\\n', "\r\n", "\r"], "\n", $description);

        $items = [];
        foreach (explode("\n", $normalised) as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            $items[] = ['label' => $line, 'amount' => $this->amountIn($line)];
        }

        return $items;
    }

    /**
     * Usulkan sub-item mana yang membentuk nilai baris ini.
     *
     * @param  array<int, array{label: string, amount: float|null}>  $items
     * @return array{selected: array<int, int>, exact: bool, ambiguous: bool}
     */
    public function suggest(array $items, float $target): array
    {
        $none = ['selected' => [], 'exact' => false, 'ambiguous' => false];

        // Bekerja dalam satuan sen (integer) supaya bebas galat pembulatan float.
        $cents = [];
        foreach ($items as $i => $item) {
            if ($item['amount'] !== null && $item['amount'] > 0) {
                $cents[$i] = (int) round($item['amount'] * 100);
            }
        }
        $goal = (int) round($target * 100);

        if ($goal <= 0 || $cents === [] || count($cents) > self::MAX_ITEMS_FOR_SUBSET) {
            return $none;
        }

        // Seluruh item kebetulan pas → tak perlu telusur kombinasi.
        if (array_sum($cents) === $goal) {
            return ['selected' => array_keys($cents), 'exact' => true, 'ambiguous' => false];
        }

        $keys = array_keys($cents);
        $values = array_values($cents);
        $n = count($values);
        $matches = [];

        for ($mask = 1; $mask < (1 << $n); $mask++) {
            $sum = 0;
            for ($bit = 0; $bit < $n; $bit++) {
                if ($mask & (1 << $bit)) {
                    $sum += $values[$bit];
                    if ($sum > $goal) {
                        break;      // prune: kombinasi ini sudah kelewat
                    }
                }
            }
            if ($sum !== $goal) {
                continue;
            }

            $picked = [];
            for ($bit = 0; $bit < $n; $bit++) {
                if ($mask & (1 << $bit)) {
                    $picked[] = $keys[$bit];
                }
            }
            $matches[] = $picked;

            if (count($matches) > 1) {
                break;              // cukup tahu bahwa solusinya tidak tunggal
            }
        }

        if ($matches === []) {
            return $none;
        }

        return ['selected' => $matches[0], 'exact' => true, 'ambiguous' => count($matches) > 1];
    }

    /** Ambil nominal terakhir bergaya Indonesia ("Rp 126.677", "Rp 1.580.710,50") dari sebuah baris. */
    protected function amountIn(string $line): ?float
    {
        if (! preg_match_all('/(?:Rp|RP|rp)\s*\.?\s*([\d][\d.,]*)/u', $line, $m)) {
            return null;
        }

        $raw = end($m[1]);
        // Titik = pemisah ribuan, koma = desimal.
        $normalised = str_replace(',', '.', str_replace('.', '', $raw));

        return is_numeric($normalised) ? (float) $normalised : null;
    }
}
