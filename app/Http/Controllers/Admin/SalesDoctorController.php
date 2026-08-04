<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

/**
 * Database Dokter (menu Sales) — BERBEDA dari master lain: langsung read–write ke tabel
 * ERP `{prefix}c_doctor` (tabel dokter Dolibarr yang belum punya UI), TANPA tabel lokal.
 * Aplikasi ini adalah satu-satunya UI-nya, jadi konvensi kolom mengikuti isi existing:
 * ref/fk_user_creat dibiarkan kosong, entity=1, status 1=aktif 0=nonaktif.
 */
class SalesDoctorController extends Controller
{
    protected function table(): Builder
    {
        return DB::connection(config('erp.connection'))->table(config('erp.prefix').'c_doctor');
    }

    public function index(Request $request): Response
    {
        $q = trim((string) $request->input('q'));
        $status = (string) $request->input('status');

        $error = null;
        $doctors = null;
        $summary = ['total' => 0, 'active' => 0];
        $specialties = [];

        try {
            $doctors = $this->table()
                ->when($q !== '', fn ($qq) => $qq->where(fn ($w) => $w
                    ->where('fullname', 'like', "%{$q}%")
                    ->orWhere('specialty', 'like', "%{$q}%")
                    ->orWhere('str_number', 'like', "%{$q}%")
                    ->orWhere('sip_number', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhere('phone_mobile', 'like', "%{$q}%")))
                ->when($status === 'active', fn ($qq) => $qq->where('status', 1))
                ->when($status === 'inactive', fn ($qq) => $qq->where('status', 0))
                ->orderBy('fullname')
                ->paginate(25, [
                    'rowid', 'fullname', 'gender', 'specialty', 'str_number', 'sip_number', 'email', 'phone_mobile',
                    'join_date', 'consultation_fee', 'bank_name', 'bank_account_number', 'note_public', 'status', 'tms',
                ])
                ->withQueryString();

            $s = $this->table()->selectRaw('COUNT(*) total, SUM(status = 1) active')->first();
            $summary = ['total' => (int) $s->total, 'active' => (int) $s->active];

            $specialties = $this->table()
                ->whereNotNull('specialty')->where('specialty', '!=', '')
                ->distinct()->orderBy('specialty')->pluck('specialty');
        } catch (Throwable $e) {
            report($e);
            $error = 'Tidak bisa terhubung ke ERP: '.$e->getMessage();
        }

        return Inertia::render('sales/doctors', [
            'q' => $q,
            'status' => $status,
            'doctors' => $doctors,
            'summary' => $summary,
            'specialties' => $specialties,
            'error' => $error,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);

        try {
            $exists = $this->table()->whereRaw('LOWER(fullname) = ?', [mb_strtolower($data['fullname'])])->exists();
            if ($exists) {
                return back()->with('error', "Dokter \"{$data['fullname']}\" sudah ada di database ERP.");
            }

            $this->table()->insert($data + [
                'entity' => 1,
                'status' => 1,
                'date_creation' => now()->toDateTimeString(),
            ]);
        } catch (Throwable $e) {
            report($e);

            return back()->with('error', 'Gagal menyimpan ke ERP: '.$e->getMessage());
        }

        return back()->with('success', 'Dokter ditambahkan langsung ke database ERP.');
    }

    public function update(Request $request, int $rowid): RedirectResponse
    {
        $data = $this->validated($request) + ['status' => $request->boolean('is_active') ? 1 : 0];

        try {
            $updated = $this->table()->where('rowid', $rowid)->update($data);
            if (! $updated && ! $this->table()->where('rowid', $rowid)->exists()) {
                return back()->with('error', 'Dokter tidak ditemukan di ERP.');
            }
        } catch (Throwable $e) {
            report($e);

            return back()->with('error', 'Gagal menyimpan ke ERP: '.$e->getMessage());
        }

        return back()->with('success', 'Data dokter di ERP diperbarui.');
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request): array
    {
        $v = $request->validate([
            'fullname' => ['required', 'string', 'max:255'],
            'gender' => ['nullable', 'in:male,female'],
            'specialty' => ['nullable', 'string', 'max:255'],
            'str_number' => ['nullable', 'string', 'max:100'],
            'sip_number' => ['nullable', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone_mobile' => ['nullable', 'string', 'max:50'],
            'join_date' => ['nullable', 'date'],
            'consultation_fee' => ['nullable', 'numeric', 'min:0'],
            'bank_name' => ['nullable', 'string', 'max:100'],
            'bank_account_number' => ['nullable', 'string', 'max:100'],
            'note_public' => ['nullable', 'string', 'max:2000'],
        ], [], ['fullname' => 'nama dokter', 'join_date' => 'tanggal bergabung', 'consultation_fee' => 'tarif konsultasi']);

        $v['consultation_fee'] = ($v['consultation_fee'] ?? '') === '' ? null : (float) $v['consultation_fee'];

        return array_map(fn ($x) => is_string($x) ? (trim($x) ?: null) : $x, $v);
    }
}
