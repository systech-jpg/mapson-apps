<?php

namespace App\Services\Hadirr;

use App\Models\Employee;
use App\Models\HadirrSetting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class HadirrSyncService
{
    public function __construct(protected HadirrService $hadirr)
    {
    }

    /**
     * Pull the Hadirr employee master into hadirr_employees and auto-match each
     * row to our HR master: by NIK KTP first, then by the linked user's email.
     *
     * @return array{total: int, matched: int}
     */
    public function syncEmployees(): array
    {
        $s = HadirrSetting::current();
        $now = now()->toDateTimeString();

        $resp = $this->hadirr->apiGet($s, 'employees');
        $list = $resp['data']['list'] ?? [];
        if (! is_array($list)) {
            throw new \RuntimeException('Format respons /employees tidak dikenal.');
        }

        $matched = 0;

        foreach ($list as $e) {
            $nik = trim((string) ($e['nik'] ?? ''));
            if ($nik === '') {
                continue;
            }

            // Auto-match: NIK KTP, then linked-user email. Keep manual matches.
            $existing = DB::table('hadirr_employees')->where('nik', $nik)->first();
            $employeeId = $existing->employee_id ?? null;
            $method = $existing->match_method ?? null;

            if (! $employeeId || $method !== 'manual') {
                $byNik = Employee::where('nik_ktp', $nik)->value('id');
                if ($byNik) {
                    [$employeeId, $method] = [$byNik, 'nik'];
                } elseif (filled($e['email'] ?? null)) {
                    $byEmail = Employee::whereHas('user', fn ($q) => $q->where('email', $e['email']))->value('id');
                    if ($byEmail) {
                        [$employeeId, $method] = [$byEmail, 'email'];
                    }
                }
            }

            if ($employeeId) {
                $matched++;
            }

            DB::table('hadirr_employees')->upsert([[
                'nik' => $nik,
                'name' => $e['name'] ?? null,
                'email' => $e['email'] ?? null,
                'phone' => $e['phone'] ?? null,
                'gender' => $e['gender'] ?? null,
                'start_date' => filled($e['start_date'] ?? null) ? $e['start_date'] : null,
                'group_name' => $e['group_name'] ?? null,
                'employee_id' => $employeeId,
                'match_method' => $employeeId ? $method : null,
                'synced_at' => $now,
            ]], ['nik'], ['name', 'email', 'phone', 'gender', 'start_date', 'group_name', 'employee_id', 'match_method', 'synced_at']);
        }

        return ['total' => count($list), 'matched' => $matched];
    }

    /**
     * Pull attendances for a date range (inclusive). Hadirr only accepts a single
     * `date` per call, so we loop the days. Idempotent upsert by (nik, date).
     *
     * @param  callable(string):void|null  $progress
     * @return array{days: int, rows: int}
     */
    public function syncAttendances(string $fromDate, string $toDate, ?callable $progress = null): array
    {
        @set_time_limit(0);
        $s = HadirrSetting::current();
        $now = now()->toDateTimeString();

        $from = Carbon::parse($fromDate)->startOfDay();
        $to = Carbon::parse($toDate)->startOfDay();
        if ($to->lt($from)) {
            [$from, $to] = [$to, $from];
        }

        $days = 0;
        $rows = 0;

        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
            $date = $d->toDateString();
            $resp = $this->hadirr->apiGet($s, 'attendances', ['date' => $date]);
            $list = $resp['data']['list'] ?? [];
            $days++;

            if (! is_array($list) || $list === []) {
                $progress && $progress("{$date}: 0 baris");
                continue;
            }

            $batch = [];
            foreach ($list as $a) {
                $nik = trim((string) ($a['nik'] ?? ''));
                if ($nik === '') {
                    continue;
                }

                $batch[] = [
                    'nik' => $nik,
                    'name' => $a['name'] ?? null,
                    'date' => $a['date'] ?? $date,
                    'clock_in' => $this->dt($a['clock_in'] ?? null),
                    'clock_out' => $this->dt($a['clock_out'] ?? null),
                    'break_at' => $this->dt($a['break'] ?? null),
                    'after_break_at' => $this->dt($a['after_break'] ?? null),
                    'overtime_in' => $this->dt($a['overtime_in'] ?? null),
                    'overtime_out' => $this->dt($a['overtime_out'] ?? null),
                    'clock_in_spot' => $a['clock_in_spot'] ?: null,
                    'clock_out_spot' => $a['clock_out_spot'] ?: null,
                    'clock_in_location' => $a['clock_in_location'] ?: null,
                    'clock_out_location' => $a['clock_out_location'] ?: null,
                    'status' => $a['status'] ?: null,
                    'shift_name' => $a['shift_name'] ?: null,
                    'group_name' => $a['group_name'] ?: null,
                    'notes' => $a['notes'] ?: null,
                    'synced_at' => $now,
                ];
            }

            if ($batch) {
                DB::table('hadirr_attendances')->upsert($batch, ['nik', 'date'], [
                    'name', 'clock_in', 'clock_out', 'break_at', 'after_break_at', 'overtime_in', 'overtime_out',
                    'clock_in_spot', 'clock_out_spot', 'clock_in_location', 'clock_out_location',
                    'status', 'shift_name', 'group_name', 'notes', 'synced_at',
                ]);
                $rows += count($batch);
            }

            $progress && $progress("{$date}: ".count($batch).' baris');
        }

        return ['days' => $days, 'rows' => $rows];
    }

    /** Empty string → null; otherwise pass through as datetime string. */
    protected function dt(?string $v): ?string
    {
        return filled($v) ? $v : null;
    }
}
