<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Generic CRUD for employee child records (addresses, contacts, emergency
 * contacts, educations, bank accounts). The {type} segment is whitelisted in
 * the route; every type maps to a relation + validation rules below.
 */
class EmployeeSubDataController extends Controller
{
    public const TYPES = ['addresses', 'contacts', 'emergency-contacts', 'educations', 'bank-accounts'];

    public function store(Request $request, Employee $employee, string $type): RedirectResponse
    {
        $cfg = $this->config($type);
        $data = $request->validate($cfg['rules']);

        DB::transaction(function () use ($employee, $cfg, $data) {
            $this->applyExclusive($this->relation($employee, $cfg), $cfg, $data);
            $this->relation($employee, $cfg)->create($data);
        });

        return back()->with('success', $cfg['label'].' berhasil ditambahkan.');
    }

    public function update(Request $request, Employee $employee, string $type, int $record): RedirectResponse
    {
        $cfg = $this->config($type);
        $data = $request->validate($cfg['rules']);
        $row = $this->relation($employee, $cfg)->findOrFail($record);

        DB::transaction(function () use ($employee, $cfg, $data, $row) {
            $this->applyExclusive($this->relation($employee, $cfg), $cfg, $data, $row->id);
            $row->update($data);
        });

        return back()->with('success', $cfg['label'].' berhasil diperbarui.');
    }

    public function destroy(Employee $employee, string $type, int $record): RedirectResponse
    {
        $cfg = $this->config($type);
        $this->relation($employee, $cfg)->findOrFail($record)->delete();

        return back()->with('success', $cfg['label'].' berhasil dihapus.');
    }

    protected function relation(Employee $employee, array $cfg): HasMany
    {
        return $employee->{$cfg['relation']}();
    }

    /**
     * Enforce single-flag fields (is_primary / is_highest): when the incoming
     * record sets the flag, clear it on the employee's other rows (optionally
     * scoped, e.g. contacts keep one primary per contact type).
     *
     * @param  array<string, mixed>  $data
     */
    protected function applyExclusive(HasMany $query, array $cfg, array $data, ?int $exceptId = null): void
    {
        $flag = $cfg['exclusive'] ?? null;
        if (! $flag || ! ($data[$flag] ?? false)) {
            return;
        }

        if ($scope = $cfg['exclusive_scope'] ?? null) {
            $query->where($scope, $data[$scope] ?? null);
        }
        if ($exceptId) {
            $query->whereKeyNot($exceptId);
        }

        $query->update([$flag => false]);
    }

    /**
     * @return array{relation: string, label: string, rules: array<string, mixed>, exclusive?: string, exclusive_scope?: string}
     */
    protected function config(string $type): array
    {
        return match ($type) {
            'addresses' => [
                'relation' => 'addresses',
                'label' => 'Alamat',
                'exclusive' => 'is_primary',
                'rules' => [
                    'type' => ['required', 'in:ktp,domicile,other'],
                    'line1' => ['required', 'string', 'max:500'],
                    'line2' => ['nullable', 'string', 'max:500'],
                    'rt' => ['nullable', 'string', 'max:10'],
                    'rw' => ['nullable', 'string', 'max:10'],
                    'kelurahan' => ['nullable', 'string', 'max:255'],
                    'kecamatan' => ['nullable', 'string', 'max:255'],
                    'city' => ['nullable', 'string', 'max:255'],
                    'province' => ['nullable', 'string', 'max:255'],
                    'postal_code' => ['nullable', 'string', 'max:16'],
                    'is_primary' => ['boolean'],
                ],
            ],
            'contacts' => [
                'relation' => 'contacts',
                'label' => 'Kontak',
                'exclusive' => 'is_primary',
                'exclusive_scope' => 'type',
                'rules' => [
                    'type' => ['required', 'in:phone,mobile,email,whatsapp'],
                    'value' => ['required', 'string', 'max:255'],
                    'label' => ['nullable', 'string', 'max:255'],
                    'is_primary' => ['boolean'],
                ],
            ],
            'emergency-contacts' => [
                'relation' => 'emergencyContacts',
                'label' => 'Kontak darurat',
                'rules' => [
                    'name' => ['required', 'string', 'max:255'],
                    'relationship' => ['nullable', 'string', 'max:255'],
                    'phone' => ['required', 'string', 'max:64'],
                    'email' => ['nullable', 'email', 'max:255'],
                    'address' => ['nullable', 'string', 'max:500'],
                ],
            ],
            'educations' => [
                'relation' => 'educations',
                'label' => 'Pendidikan',
                'exclusive' => 'is_highest',
                'rules' => [
                    'level' => ['required', 'in:sd,smp,sma,smk,d1,d2,d3,d4,s1,s2,s3,other'],
                    'institution' => ['required', 'string', 'max:255'],
                    'major' => ['nullable', 'string', 'max:255'],
                    'start_year' => ['nullable', 'integer', 'min:1950', 'max:2100'],
                    'end_year' => ['nullable', 'integer', 'min:1950', 'max:2100'],
                    'gpa' => ['nullable', 'numeric', 'min:0', 'max:4'],
                    'is_highest' => ['boolean'],
                ],
            ],
            'bank-accounts' => [
                'relation' => 'bankAccounts',
                'label' => 'Rekening bank',
                'exclusive' => 'is_primary',
                'rules' => [
                    'bank_name' => ['required', 'string', 'max:255'],
                    'account_number' => ['required', 'string', 'max:64'],
                    'account_holder' => ['nullable', 'string', 'max:255'],
                    'branch' => ['nullable', 'string', 'max:255'],
                    'is_primary' => ['boolean'],
                ],
            ],
            default => abort(404),
        };
    }
}
