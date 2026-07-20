<?php

namespace App\Services\Erp;

use Illuminate\Support\Facades\DB;

/**
 * Aktivitas pengiriman gudang dari Dolibarr: barang yang DIKIRIM untuk sebuah tindakan
 * medis vs yang benar-benar TERPAKAI (pola konsinyasi alkes — satu set instrumen dikirim,
 * beberapa item terpakai, sisanya kembali).
 *
 * Query LANGSUNG ke DB ERP (tanpa staging): DB-nya lokal, volumenya kecil (±435 tindakan /
 * 4.6rb baris detail), dan sudah jadi pola di AttendCaseService & ErpStockSyncService::movements().
 * Staging hanya akan menambah ETL yang harus dijaga tanpa manfaat.
 *
 * CATATAN: `usage_report.date_usage` KOSONG di data, jadi dimensi waktu memakai
 * `tindakan.tanggal` (terisi 100%), bukan tanggal pemakaian.
 */
class WarehouseActivityService
{
    protected function conn()
    {
        return DB::connection(config('erp.connection'));
    }

    protected function prefix(): string
    {
        return (string) config('erp.prefix');
    }

    /** @return string daftar entity yang aman untuk di-inline (int saja) */
    protected function entities(): string
    {
        $e = config('erp.entities');
        $list = is_array($e) ? $e : [$e];

        return implode(',', array_map('intval', $list)) ?: '1';
    }

    /**
     * FROM + JOIN inti: tindakan → usage_report → detail.
     * Sengaja TANPA WHERE, supaya pemanggil bisa menambah JOIN lain sebelum WHERE.
     */
    protected function from(): string
    {
        $p = $this->prefix();

        return "FROM {$p}tindakan t
                JOIN {$p}usage_report u ON u.fk_tindakan = t.id
                JOIN {$p}usage_report_det d ON d.fk_usage_report = u.rowid ";
    }

    /** WHERE standar: entity + rentang tanggal tindakan (date_usage kosong di data). */
    protected function where(): string
    {
        return " WHERE t.entity IN ({$this->entities()}) AND t.tanggal BETWEEN ? AND ? ";
    }

    /**
     * Ringkasan periode: berapa yang diangkut vs benar-benar terpakai.
     *
     * @return array<string, float|int>
     */
    public function summary(string $from, string $to): array
    {
        $r = $this->conn()->selectOne(
            'SELECT COUNT(DISTINCT t.id) kasus, COUNT(DISTINCT t.ref_sj) sj,
                    COUNT(DISTINCT t.fk_soc) rs, COUNT(DISTINCT d.fk_product) item,
                    COUNT(DISTINCT CASE WHEN d.qty_used > 0 THEN d.fk_product END) item_used,
                    COALESCE(SUM(d.qty_sent),0) sent, COALESCE(SUM(d.qty_used),0) used '
            .$this->from().$this->where(),
            [$from, $to]
        );

        $sent = (float) $r->sent;
        $used = (float) $r->used;

        return [
            'kasus' => (int) $r->kasus,
            'sj' => (int) $r->sj,
            'rs' => (int) $r->rs,
            // `item` = jenis item yang DIKIRIM; `itemUsed` = jenis yang benar-benar terpakai.
            // Dua angka berbeda — jangan dipakai bergantian.
            'item' => (int) $r->item,
            'itemUsed' => (int) $r->item_used,
            'sent' => $sent,
            'used' => $used,
            'kembali' => $sent - $used,
            // Hit-rate = proporsi unit terangkut yang benar-benar terpakai.
            'hitRate' => $sent > 0 ? round($used / $sent * 100, 1) : null,
        ];
    }

    /**
     * Tren per bulan (basis tindakan.tanggal).
     *
     * @return array<int, array<string, mixed>>
     */
    public function byMonth(string $from, string $to): array
    {
        return array_map(fn ($r) => [
            'period' => $r->bln,
            'kasus' => (int) $r->kasus,
            'sent' => (float) $r->sent,
            'used' => (float) $r->used,
            'hitRate' => $r->sent > 0 ? round($r->used / $r->sent * 100, 1) : null,
        ], $this->conn()->select(
            'SELECT DATE_FORMAT(t.tanggal, "%Y-%m") bln, COUNT(DISTINCT t.id) kasus,
                    SUM(d.qty_sent) sent, SUM(d.qty_used) used '
            .$this->from().$this->where().'
             GROUP BY bln ORDER BY bln',
            [$from, $to]
        ));
    }

    /**
     * Per rumah sakit — siapa yang menuntut angkutan paling besar.
     *
     * @return array<int, array<string, mixed>>
     */
    public function byHospital(string $from, string $to, int $limit = 12): array
    {
        $p = $this->prefix();

        return array_map(fn ($r) => [
            'rs' => (string) $r->nama,
            'kasus' => (int) $r->kasus,
            'sent' => (float) $r->sent,
            'used' => (float) $r->used,
            'hitRate' => $r->sent > 0 ? round($r->used / $r->sent * 100, 1) : null,
        ], $this->conn()->select(
            "SELECT COALESCE(NULLIF(s.nom,''), '(tanpa nama)') nama, COUNT(DISTINCT t.id) kasus,
                    SUM(d.qty_sent) sent, SUM(d.qty_used) used "
            .$this->from()."LEFT JOIN {$p}societe s ON s.rowid = t.fk_soc "
            .$this->where()."
             GROUP BY nama ORDER BY sent DESC LIMIT {$limit}",
            [$from, $to]
        ));
    }

    /**
     * Item yang sering diangkut tapi TAK PERNAH terpakai — beban mati di dalam kit.
     * Ini temuan yang langsung bisa ditindaklanjuti: rampingkan isi kit.
     *
     * @return array<int, array<string, mixed>>
     */
    public function deadWeight(string $from, string $to, int $limit = 15): array
    {
        $p = $this->prefix();

        return array_map(fn ($r) => [
            'ref' => (string) $r->ref,
            'label' => (string) $r->label,
            'sent' => (float) $r->sent,
            'used' => (float) $r->used,
            'kasus' => (int) $r->kasus,
        ], $this->conn()->select(
            "SELECT pr.ref, pr.label, COUNT(DISTINCT t.id) kasus,
                    SUM(d.qty_sent) sent, SUM(d.qty_used) used "
            .$this->from()."JOIN {$p}product pr ON pr.rowid = d.fk_product "
            .$this->where()."
             GROUP BY pr.ref, pr.label
             HAVING used = 0 AND sent > 0
             ORDER BY sent DESC LIMIT {$limit}",
            [$from, $to]
        ));
    }

    /**
     * Item paling banyak terpakai (bukan sekadar terangkut) — fast moving sesungguhnya.
     *
     * @return array<int, array<string, mixed>>
     */
    public function topUsed(string $from, string $to, int $limit = 15): array
    {
        $p = $this->prefix();

        return array_map(fn ($r) => [
            'ref' => (string) $r->ref,
            'label' => (string) $r->label,
            'sent' => (float) $r->sent,
            'used' => (float) $r->used,
            'kasus' => (int) $r->kasus,
            'hitRate' => $r->sent > 0 ? round($r->used / $r->sent * 100, 1) : null,
        ], $this->conn()->select(
            "SELECT pr.ref, pr.label, COUNT(DISTINCT t.id) kasus,
                    SUM(d.qty_sent) sent, SUM(d.qty_used) used "
            .$this->from()."JOIN {$p}product pr ON pr.rowid = d.fk_product "
            .$this->where()."
             GROUP BY pr.ref, pr.label
             HAVING used > 0
             ORDER BY used DESC LIMIT {$limit}",
            [$from, $to]
        ));
    }

    /**
     * Per item: diangkut vs terpakai. Satu data, beberapa sudut pandang — urutannya yang
     * berubah sesuai KPI yang diklik (paling banyak diangkut / terpakai / mubazir / hit terburuk).
     *
     * @param  string  $sort  sent|used|kembali|hit
     * @return array<int, array<string, mixed>>
     */
    public function byItem(string $from, string $to, string $sort = 'sent', int $limit = 300): array
    {
        $p = $this->prefix();
        // ORDER BY harus mengulang agregatnya: MySQL menolak alias agregat yang dipakai
        // DI DALAM ekspresi ("Reference 'sent' not supported (reference to group function)").
        $order = match ($sort) {
            'used' => 'SUM(d.qty_used) DESC',
            'kembali' => '(SUM(d.qty_sent) - SUM(d.qty_used)) DESC',
            // Hit terburuk dulu; yang tak pernah terpakai di atas, lalu yang paling banyak diangkut.
            'hit' => '(SUM(d.qty_used) / NULLIF(SUM(d.qty_sent),0)) ASC, SUM(d.qty_sent) DESC',
            default => 'SUM(d.qty_sent) DESC',
        };

        return array_map(fn ($r) => [
            'ref' => (string) $r->ref,
            'label' => (string) $r->label,
            'kasus' => (int) $r->kasus,
            'sent' => (float) $r->sent,
            'used' => (float) $r->used,
            'kembali' => (float) $r->sent - (float) $r->used,
            'hitRate' => $r->sent > 0 ? round($r->used / $r->sent * 100, 1) : null,
        ], $this->conn()->select(
            "SELECT pr.ref, pr.label, COUNT(DISTINCT t.id) kasus,
                    SUM(d.qty_sent) sent, SUM(d.qty_used) used "
            .$this->from()."JOIN {$p}product pr ON pr.rowid = d.fk_product "
            .$this->where()."
             GROUP BY pr.ref, pr.label
             HAVING sent > 0
             ORDER BY {$order} LIMIT {$limit}",
            [$from, $to]
        ));
    }

    /**
     * Detail per tindakan / surat jalan — level terdalam: kapan, ke RS mana, SJ berapa,
     * dan untuk item itu berapa yang diangkut vs terpakai.
     *
     * @param  string|null  $ref  kode produk (kalau menelusuri dari sebuah item)
     * @param  string|null  $rs  nama rumah sakit (kalau menelusuri dari sebuah RS)
     * @param  bool  $sensitive  boleh melihat nama pasien & dokter (lihat User::canSeeSensitiveSales)
     * @return array<int, array<string, mixed>>
     */
    public function detail(string $from, string $to, ?string $ref, ?string $rs, bool $sensitive, int $limit = 1000): array
    {
        $p = $this->prefix();
        $bind = [$from, $to];
        $extra = '';

        if (filled($ref)) {
            $extra .= ' AND pr.ref = ? ';
            $bind[] = $ref;
        }
        if (filled($rs)) {
            $extra .= ' AND s.nom = ? ';
            $bind[] = $rs;
        }

        // Kolom sensitif hanya di-SELECT bila berhak — jangan pernah kirim lalu sembunyikan di UI.
        // t.dokter menyimpan ID ke c_doctor (bukan nama), jadi di-resolve seperti
        // SalesSyncService; kalau tak ketemu, tampilkan apa adanya.
        $kolomSensitif = $sensitive ? ', t.pasien, COALESCE(dr.fullname, t.dokter) dokter' : '';
        $joinDokter = $sensitive ? "LEFT JOIN {$p}c_doctor dr ON dr.rowid = t.dokter " : '';
        $groupSensitif = $sensitive ? ', t.pasien, dr.fullname, t.dokter' : '';

        return array_map(fn ($r) => [
            'tindakan' => (string) $r->tref,
            'tanggal' => $r->tanggal,
            'rs' => (string) ($r->nom ?? ''),
            'sj' => (string) ($r->ref_sj ?? ''),
            'delivery' => $r->date_delivery,
            'jenis' => (string) ($r->jenis_tindakan ?? ''),
            'pasien' => $sensitive ? ($r->pasien ?? null) : null,
            'dokter' => $sensitive ? ($r->dokter ?? null) : null,
            'ref' => (string) ($r->pref ?? ''),
            'label' => (string) ($r->plabel ?? ''),
            'sent' => (float) $r->sent,
            'used' => (float) $r->used,
        ], $this->conn()->select(
            "SELECT t.ref tref, t.tanggal, t.ref_sj, t.date_delivery, t.jenis_tindakan{$kolomSensitif},
                    s.nom, pr.ref pref, pr.label plabel,
                    SUM(d.qty_sent) sent, SUM(d.qty_used) used "
            .$this->from()."JOIN {$p}product pr ON pr.rowid = d.fk_product
             LEFT JOIN {$p}societe s ON s.rowid = t.fk_soc "
            .$joinDokter
            .$this->where().$extra."
             GROUP BY t.id, t.ref, t.tanggal, t.ref_sj, t.date_delivery, t.jenis_tindakan, s.nom, pr.ref, pr.label{$groupSensitif}
             ORDER BY t.tanggal DESC, t.ref LIMIT {$limit}",
            $bind
        ));
    }

    /**
     * Jumlah PENGIRIMAN per bulan — dihitung dari tindakan langsung, BUKAN lewat usage report.
     *
     * Dua hal yang membuat ini harus berdiri sendiri:
     *  1. 129 dari 422 tindakan (Jan–Jul 2026) tidak punya usage report sama sekali, padahal
     *     116 di antaranya PUNYA surat jalan → kalau dihitung lewat usage report, pengiriman
     *     nyata itu hilang dari laporan.
     *  2. Basis waktunya `date_delivery` (tanggal barang dikirim), bukan `tanggal` (tanggal
     *     tindakan) — rata-rata kirim 6,8 hari LEBIH AWAL, dan 62 kasus jatuh di bulan berbeda.
     *
     * `belum_lapor` = pengiriman yang belum ada usage report-nya → indikator pekerjaan
     * administrasi yang tertinggal, sekaligus alasan angka pemakaian belum lengkap.
     *
     * @return array<int, array<string, mixed>>
     */
    public function shipmentsByMonth(string $from, string $to): array
    {
        $p = $this->prefix();

        return array_map(fn ($r) => [
            'period' => $r->bln,
            'sj' => (int) $r->sj,
            'tindakan' => (int) $r->tindakan,
            'belumLapor' => (int) $r->belum_lapor,
            'rs' => (int) $r->rs,
        ], $this->conn()->select(
            "SELECT DATE_FORMAT(t.date_delivery, '%Y-%m') bln,
                    COUNT(DISTINCT NULLIF(t.ref_sj, '')) sj,
                    COUNT(DISTINCT t.id) tindakan,
                    COUNT(DISTINCT CASE WHEN u.rowid IS NULL THEN t.id END) belum_lapor,
                    COUNT(DISTINCT t.fk_soc) rs
               FROM {$p}tindakan t
               LEFT JOIN {$p}usage_report u ON u.fk_tindakan = t.id
              WHERE t.entity IN ({$this->entities()})
                AND t.date_delivery IS NOT NULL
                AND DATE(t.date_delivery) BETWEEN ? AND ?
              GROUP BY bln ORDER BY bln",
            [$from, $to]
        ));
    }

    /**
     * Ringkasan pengiriman (bukan pemakaian) pada rentang tanggal KIRIM.
     *
     * @return array<string, int>
     */
    public function shipmentSummary(string $from, string $to): array
    {
        $p = $this->prefix();
        $r = $this->conn()->selectOne(
            "SELECT COUNT(DISTINCT NULLIF(t.ref_sj, '')) sj,
                    COUNT(DISTINCT t.id) tindakan,
                    COUNT(DISTINCT CASE WHEN u.rowid IS NULL THEN t.id END) belum_lapor,
                    COUNT(DISTINCT CASE WHEN t.ref_sj IS NULL OR t.ref_sj = '' THEN t.id END) tanpa_sj,
                    COUNT(DISTINCT t.fk_soc) rs
               FROM {$p}tindakan t
               LEFT JOIN {$p}usage_report u ON u.fk_tindakan = t.id
              WHERE t.entity IN ({$this->entities()})
                AND t.date_delivery IS NOT NULL
                AND DATE(t.date_delivery) BETWEEN ? AND ?",
            [$from, $to]
        );

        return [
            'sj' => (int) $r->sj,
            'tindakan' => (int) $r->tindakan,
            'belumLapor' => (int) $r->belum_lapor,
            'tanpaSj' => (int) $r->tanpa_sj,
            'rs' => (int) $r->rs,
        ];
    }

    /**
     * RITASE — jumlah trip kendaraan gudang.
     *
     * Aturan bisnis:
     *  - DO (expedition Dolibarr) yang sudah dibuat/deliver = **1 trip** (kirim saja).
     *  - Tindakan yang statusnya sudah deliver = **2 trip** (kirim + penarikan alat, maks H+2).
     *
     * Basis waktu = tanggal KIRIM (kapan kendaraan jalan), bukan tanggal tindakan.
     * DO dan tindakan terbukti dua alur terpisah (0 dari 422 tindakan memakai fk_shipment,
     * dan 0 expedition dipakai tindakan) → dijumlahkan tanpa risiko dobel hitung.
     *
     * Status tindakan: 2 = sudah dikirim tapi alat BELUM ditarik (trip ke-2 masih menunggu),
     * 3 = sudah dikirim & sudah ditarik/dilaporkan. Keduanya dihitung 2 trip karena
     * penarikan adalah komitmen yang pasti terjadi; jumlah yang masih menunggu dilaporkan
     * terpisah lewat `menungguTarik`.
     */
    protected function ritaseSql(): array
    {
        $p = $this->prefix();
        $ent = $this->entities();

        return [
            // DO tervalidasi (fk_statut > 0 = validated/closed).
            'do' => "SELECT DATE_FORMAT(COALESCE(e.date_delivery, e.date_creation), '%Y-%m') bln, COUNT(*) n
                       FROM {$p}expedition e
                      WHERE e.entity IN ({$ent}) AND e.fk_statut > 0
                        AND DATE(COALESCE(e.date_delivery, e.date_creation)) BETWEEN ? AND ?
                      GROUP BY bln",
            // Tindakan yang sudah dikirim.
            'td' => "SELECT DATE_FORMAT(t.date_delivery, '%Y-%m') bln, COUNT(*) n,
                            SUM(t.status = 2) menunggu
                       FROM {$p}tindakan t
                      WHERE t.entity IN ({$ent}) AND t.status IN (2, 3)
                        AND DATE(t.date_delivery) BETWEEN ? AND ?
                      GROUP BY bln",
        ];
    }

    /**
     * Ritase per bulan.
     *
     * @return array<int, array<string, mixed>>
     */
    public function ritaseByMonth(string $from, string $to): array
    {
        $sql = $this->ritaseSql();
        $do = collect($this->conn()->select($sql['do'], [$from, $to]))->keyBy('bln');
        $td = collect($this->conn()->select($sql['td'], [$from, $to]))->keyBy('bln');

        $bulan = $do->keys()->merge($td->keys())->unique()->sort()->values();

        return $bulan->map(function ($b) use ($do, $td) {
            $nDo = (int) ($do[$b]->n ?? 0);
            $nTd = (int) ($td[$b]->n ?? 0);

            return [
                'period' => $b,
                'do' => $nDo,
                'tindakan' => $nTd,
                'menungguTarik' => (int) ($td[$b]->menunggu ?? 0),
                'ritDo' => $nDo,
                'ritTindakan' => $nTd * 2,
                'ritase' => $nDo + $nTd * 2,
            ];
        })->all();
    }

    /**
     * Ringkasan ritase.
     *
     * @return array<string, int|float>
     */
    public function ritaseSummary(string $from, string $to): array
    {
        $rows = collect($this->ritaseByMonth($from, $to));
        $do = (int) $rows->sum('do');
        $td = (int) $rows->sum('tindakan');
        $total = $do + $td * 2;

        return [
            'do' => $do,
            'tindakan' => $td,
            'ritDo' => $do,
            'ritTindakan' => $td * 2,
            'total' => $total,
            // Trip penarikan yang belum terjadi — sudah dihitung di total (komitmen).
            'menungguTarik' => (int) $rows->sum('menungguTarik'),
            'porsiTindakan' => $total > 0 ? round($td * 2 / $total * 100, 1) : null,
        ];
    }

    /**
     * Rincian ritase: daftar DO di balik trip-trip itu (1 trip masing-masing).
     *
     * @return array<int, array<string, mixed>>
     */
    public function ritaseDoList(string $from, string $to, int $limit = 500): array
    {
        $p = $this->prefix();

        return array_map(fn ($r) => [
            'jenis' => 'DO',
            'ref' => (string) $r->ref,
            'tanggal' => $r->kirim,
            'rs' => (string) ($r->nom ?? ''),
            'status' => (int) $r->fk_statut,
            'statusLabel' => ((int) $r->fk_statut) === 2 ? 'Selesai' : 'Tervalidasi',
            'trip' => 1,
            'menunggu' => false,
        ], $this->conn()->select(
            "SELECT e.ref, COALESCE(e.date_delivery, e.date_creation) kirim, e.fk_statut, s.nom
               FROM {$p}expedition e
               LEFT JOIN {$p}societe s ON s.rowid = e.fk_soc
              WHERE e.entity IN ({$this->entities()}) AND e.fk_statut > 0
                AND DATE(COALESCE(e.date_delivery, e.date_creation)) BETWEEN ? AND ?
              ORDER BY kirim DESC LIMIT {$limit}",
            [$from, $to]
        ));
    }

    /**
     * Rincian ritase: daftar tindakan (2 trip masing-masing).
     * `$hanyaMenunggu` = hanya yang alatnya belum ditarik (status 2).
     *
     * @return array<int, array<string, mixed>>
     */
    public function ritaseTindakanList(string $from, string $to, bool $hanyaMenunggu = false, int $limit = 500): array
    {
        $p = $this->prefix();
        $status = $hanyaMenunggu ? 'AND t.status = 2' : 'AND t.status IN (2, 3)';

        return array_map(fn ($r) => [
            'jenis' => 'Tindakan',
            'ref' => (string) $r->ref,
            'tanggal' => $r->date_delivery,
            'tanggalTindakan' => $r->tanggal,
            'sj' => (string) ($r->ref_sj ?? ''),
            'rs' => (string) ($r->nom ?? ''),
            'status' => (int) $r->status,
            'statusLabel' => ((int) $r->status) === 2 ? 'Alat belum ditarik' : 'Selesai (alat sudah ditarik)',
            'trip' => 2,
            'menunggu' => ((int) $r->status) === 2,
        ], $this->conn()->select(
            "SELECT t.ref, t.tanggal, t.date_delivery, t.ref_sj, t.status, s.nom
               FROM {$p}tindakan t
               LEFT JOIN {$p}societe s ON s.rowid = t.fk_soc
              WHERE t.entity IN ({$this->entities()}) {$status}
                AND DATE(t.date_delivery) BETWEEN ? AND ?
              ORDER BY t.date_delivery DESC, t.ref LIMIT {$limit}",
            [$from, $to]
        ));
    }

    /**
     * Daftar pengiriman (tindakan yang sudah deliver) di balik kartu "Jumlah Pengiriman".
     *
     * @param  string  $filter  all | no_usage (belum ada usage report) | no_sj (tanpa nomor SJ)
     * @return array<int, array<string, mixed>>
     */
    public function shipmentList(string $from, string $to, string $filter = 'all', int $limit = 500): array
    {
        $p = $this->prefix();
        $cond = match ($filter) {
            'no_usage' => 'AND u.rowid IS NULL',
            'no_sj' => "AND (t.ref_sj IS NULL OR t.ref_sj = '')",
            default => '',
        };

        return array_map(fn ($r) => [
            'ref' => (string) $r->ref,
            'tanggal' => $r->date_delivery,
            'tanggalTindakan' => $r->tanggal,
            'sj' => (string) ($r->ref_sj ?? ''),
            'rs' => (string) ($r->nom ?? ''),
            'status' => (int) $r->status,
            'belumLapor' => ((int) $r->has_usage) === 0,
        ], $this->conn()->select(
            "SELECT t.ref, t.tanggal, t.date_delivery, t.ref_sj, t.status, s.nom,
                    MAX(u.rowid IS NOT NULL) has_usage
               FROM {$p}tindakan t
               LEFT JOIN {$p}societe s ON s.rowid = t.fk_soc
               LEFT JOIN {$p}usage_report u ON u.fk_tindakan = t.id
              WHERE t.entity IN ({$this->entities()}) AND t.status IN (2, 3)
                AND DATE(t.date_delivery) BETWEEN ? AND ? {$cond}
              GROUP BY t.id, t.ref, t.tanggal, t.date_delivery, t.ref_sj, t.status, s.nom
              ORDER BY t.date_delivery DESC, t.ref LIMIT {$limit}",
            [$from, $to]
        ));
    }

    /** Rentang tanggal tindakan yang tersedia, untuk default filter. */
    public function range(): array
    {
        $r = $this->conn()->selectOne(
            'SELECT MIN(t.tanggal) mn, MAX(t.tanggal) mx FROM '.$this->prefix().'tindakan t
             WHERE t.entity IN ('.$this->entities().') AND t.tanggal IS NOT NULL'
        );

        return ['min' => $r->mn ?? null, 'max' => $r->mx ?? null];
    }
}
