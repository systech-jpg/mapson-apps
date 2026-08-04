<?php

namespace App\Services\Erp;

use App\Models\PricingHospital;
use Illuminate\Support\Facades\DB;

/**
 * Sync master Rumah Sakit dari Dolibarr societe → pricing_hospitals.
 *
 * Diambil societe yang third-party type-nya (c_typent.code) termasuk tipe "pembeli RS":
 * Private Hospital / Government / Corporate / Sub Distributor. Nama tampil memakai
 * name_alias (nama RS yang dikenal, mis. "RS Premier Bintaro"); nom (badan hukum PT/
 * Yayasan) disimpan di legal_name. Baris manual (erp_societe_id null) yang namanya sama
 * otomatis DITAUTKAN, bukan diduplikasi — referensi pricing/sales daily tetap utuh.
 */
class HospitalSyncService
{
    /**
     * MAP_CUSTGV ikut dijaga untuk kompatibilitas ejaan; di ERP saat ini yang terdaftar
     * MAP_CUSTGO. MAP_CUSTCO & MAP_SUBDIST belum ada isinya/typent-nya — begitu dibuat di
     * Dolibarr otomatis ikut tertarik tanpa ubah kode.
     */
    public const TYPE_CODES = ['MAP_CUSTPH', 'MAP_CUSTGO', 'MAP_CUSTGV', 'MAP_CUSTCO', 'MAP_SUBDIST'];

    public const TYPE_LABELS = [
        'MAP_CUSTPH' => 'RS Swasta',
        'MAP_CUSTGO' => 'Pemerintah',
        'MAP_CUSTGV' => 'Pemerintah',
        'MAP_CUSTCO' => 'Corporate',
        'MAP_SUBDIST' => 'Sub Distributor',
    ];

    /**
     * @return array{pulled: int, created: int, linked: int, updated: int, deactivated: int}
     */
    public function sync(): array
    {
        $p = config('erp.prefix');
        $entities = array_filter(array_map('trim', explode(',', (string) config('erp.entities', '1'))));

        $rows = DB::connection(config('erp.connection'))->table($p.'societe as s')
            ->join($p.'c_typent as t', 't.id', '=', 's.fk_typent')
            ->whereIn('t.code', self::TYPE_CODES)
            ->when($entities, fn ($q) => $q->whereIn('s.entity', $entities))
            ->orderBy('s.rowid')
            ->get(['s.rowid', 's.nom', 's.name_alias', 's.code_client', 's.town', 's.status', 't.code as type_code']);

        $now = now();
        $created = $linked = $updated = 0;

        foreach ($rows as $r) {
            $legal = trim((string) $r->nom);
            $name = trim((string) $r->name_alias) ?: $legal;

            $h = PricingHospital::where('erp_societe_id', $r->rowid)->first();
            if (! $h) {
                // Tautkan baris manual dengan nama sama (alias ATAU badan hukum) agar tidak dobel.
                $h = PricingHospital::whereNull('erp_societe_id')
                    ->where(fn ($q) => $q
                        ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
                        ->orWhereRaw('LOWER(name) = ?', [mb_strtolower($legal)]))
                    ->first();
                if ($h) {
                    $linked++;
                }
            }

            $attrs = [
                'erp_societe_id' => (int) $r->rowid,
                'name' => $name,
                'legal_name' => $legal ?: null,
                'erp_type_code' => $r->type_code,
                'code_client' => $r->code_client ?: null,
                'city' => trim((string) $r->town) ?: null,
                'is_active' => (bool) $r->status,
            ];

            if ($h) {
                $h->fill($attrs);
                if ($h->isDirty()) {
                    $updated++;
                }
                $h->synced_at = $now;
                $h->save();
            } else {
                PricingHospital::create($attrs + ['synced_at' => $now]);
                $created++;
            }
        }

        // Baris hasil sync yang hilang dari ERP dinonaktifkan (bukan dihapus — masih
        // direferensikan pricing/sales daily). Dilewati bila tarikan kosong (indikasi
        // masalah koneksi/typent, bukan datanya yang benar-benar hilang).
        $deactivated = 0;
        if ($rows->isNotEmpty()) {
            $deactivated = PricingHospital::whereNotNull('erp_societe_id')
                ->whereNotIn('erp_societe_id', $rows->pluck('rowid'))
                ->where('is_active', true)
                ->update(['is_active' => false]);
        }

        return [
            'pulled' => $rows->count(),
            'created' => $created,
            'linked' => $linked,
            'updated' => $updated,
            'deactivated' => $deactivated,
        ];
    }
}
