<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PricingHospital;
use App\Models\SyncLog;
use App\Services\Erp\HospitalSyncService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

/**
 * Database Rumah Sakit (menu Sales) — master RS di pricing_hospitals, sumber utama
 * sync Dolibarr societe (HospitalSyncService); baris manual tetap didukung.
 */
class SalesHospitalController extends Controller
{
    public function index(Request $request): Response
    {
        $q = trim((string) $request->input('q'));
        $type = (string) $request->input('type');
        $status = (string) $request->input('status');

        $hospitals = PricingHospital::query()
            ->when($q !== '', fn ($qq) => $qq->where(fn ($w) => $w
                ->where('name', 'like', "%{$q}%")
                ->orWhere('legal_name', 'like', "%{$q}%")
                ->orWhere('code_client', 'like', "%{$q}%")
                ->orWhere('city', 'like', "%{$q}%")))
            ->when($type === 'manual', fn ($qq) => $qq->whereNull('erp_societe_id'))
            ->when($type !== '' && $type !== 'manual', fn ($qq) => $qq->where('erp_type_code', $type))
            ->when($status === 'active', fn ($qq) => $qq->where('is_active', true))
            ->when($status === 'inactive', fn ($qq) => $qq->where('is_active', false))
            ->orderBy('name')
            ->paginate(25)->withQueryString();

        $byType = PricingHospital::query()
            ->selectRaw("COALESCE(erp_type_code, 'manual') t, COUNT(*) n, SUM(is_active) active")
            ->groupBy('t')->get()->keyBy('t');

        return Inertia::render('sales/hospitals', [
            'q' => $q,
            'type' => $type,
            'status' => $status,
            'hospitals' => $hospitals,
            'summary' => [
                'total' => (int) $byType->sum('n'),
                'active' => (int) $byType->sum('active'),
                'byType' => $byType->map(fn ($r) => (int) $r->n),
            ],
            'typeLabels' => HospitalSyncService::TYPE_LABELS,
            'lastSync' => PricingHospital::max('synced_at'),
        ]);
    }

    /** Tarik ulang seluruh societe bertipe RS dari Dolibarr (upsert, tautkan duplikat nama). */
    public function sync(Request $request, HospitalSyncService $service): RedirectResponse
    {
        $start = microtime(true);
        try {
            $r = $service->sync();
        } catch (Throwable $e) {
            report($e);
            SyncLog::record('erp', 'ERP hospitals', 'failed', null, $e->getMessage(), (int) round((microtime(true) - $start) * 1000), 'manual', $request->user()->id);

            return back()->with('error', 'Gagal sync RS dari ERP: '.$e->getMessage());
        }

        SyncLog::record('erp', 'ERP hospitals', 'success', $r, null, (int) round((microtime(true) - $start) * 1000), 'manual', $request->user()->id);

        $extra = [];
        if ($r['created']) {
            $extra[] = "{$r['created']} baru";
        }
        if ($r['linked']) {
            $extra[] = "{$r['linked']} baris manual ditautkan";
        }
        if ($r['updated']) {
            $extra[] = "{$r['updated']} diperbarui";
        }
        if ($r['deactivated']) {
            $extra[] = "{$r['deactivated']} dinonaktifkan (hilang dari ERP)";
        }

        return back()->with('success', "Sync RS selesai — {$r['pulled']} rumah sakit tertarik dari ERP.".($extra ? ' '.implode(', ', $extra).'.' : ''));
    }

    /**
     * Penambahan RS baru sengaja TIDAK difasilitasi di sini — societe dibuat di ERP
     * (Dolibarr) oleh admin sales, lalu Sync. Baris manual lama (dari pricing engine)
     * masih boleh dirapikan: nama/kota bisa diubah sampai tertaut ke ERP.
     */
    public function update(Request $request, PricingHospital $hospital): RedirectResponse
    {
        // Identitas baris ERP dikelola dari Dolibarr — di sini hanya boleh toggle aktif.
        $rules = ['is_active' => ['required', 'boolean']];
        if ($hospital->erp_societe_id === null) {
            $rules['name'] = ['required', 'string', 'max:255', 'unique:pricing_hospitals,name,'.$hospital->id];
            $rules['city'] = ['nullable', 'string', 'max:100'];
        }

        $hospital->update($request->validate($rules));

        return back()->with('success', 'Rumah sakit diperbarui.');
    }
}
