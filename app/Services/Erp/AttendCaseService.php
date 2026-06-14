<?php

namespace App\Services\Erp;

use App\Models\AttendCaseFee;
use App\Models\Employee;
use App\Support\AttendancePeriod;
use Illuminate\Support\Facades\DB;

/**
 * Reads "attend case" data (medical actions) from the Dolibarr ERP table
 * `{prefix}tindakan`. The attending employee is `nama_ts` (a Dolibarr user id,
 * matched to employees via `erp_user_id`). Fee = cases × the employee's tier fee.
 */
class AttendCaseService
{
    private function conn(): string
    {
        return config('erp.connection');
    }

    private function prefix(): string
    {
        return config('erp.prefix');
    }

    private function entities(): string
    {
        return collect(explode(',', (string) config('erp.entities', '1')))
            ->map(fn ($e) => (int) trim($e))->filter(fn ($e) => $e >= 0)->implode(',') ?: '1';
    }

    /** Admin recap: all attenders in the period, mapped to employees + fee by tier. */
    public function recap(?string $periodInput): array
    {
        [$period, $from, $to] = AttendancePeriod::resolve($periodInput);
        $p = $this->prefix();

        $rows = DB::connection($this->conn())->select(
            "SELECT t.nama_ts AS erp_user_id, COUNT(*) AS cases,
                    TRIM(CONCAT(u.firstname, ' ', COALESCE(u.lastname, ''))) AS erp_name
               FROM {$p}tindakan t
               LEFT JOIN {$p}user u ON u.rowid = t.nama_ts
              WHERE t.tanggal BETWEEN ? AND ?
                AND t.nama_ts REGEXP '^[0-9]+$'
                AND t.entity IN ({$this->entities()})
              GROUP BY t.nama_ts, erp_name
              ORDER BY cases DESC",
            [$from->toDateString(), $to->toDateString()]
        );

        $ids = array_map(fn ($r) => (int) $r->erp_user_id, $rows);
        $employees = Employee::whereIn('erp_user_id', $ids)->with('currentPosition:id,name')->get()->keyBy('erp_user_id');
        $fees = AttendCaseFee::all();
        $feeByTier = $fees->pluck('fee', 'tier')->map(fn ($f) => (float) $f)->all();
        $labelByTier = $fees->pluck('label', 'tier')->all();

        $out = [];
        $totalCases = 0;
        $totalFee = 0.0;
        foreach ($rows as $r) {
            $erpId = (int) $r->erp_user_id;
            $emp = $employees->get($erpId);
            $tier = $emp?->attend_tier;
            $feePer = $tier ? ($feeByTier[$tier] ?? 0) : 0;
            $cases = (int) $r->cases;
            $fee = $cases * $feePer;
            $totalCases += $cases;
            $totalFee += $fee;

            $out[] = [
                'erp_user_id' => $erpId,
                'employee_id' => $emp?->id,
                'name' => $emp?->full_name ?: ($r->erp_name ?: 'User #'.$erpId),
                'position' => $emp?->currentPosition?->name,
                'matched' => (bool) $emp,
                'tier' => $tier,
                'tier_label' => $tier ? ($labelByTier[$tier] ?? null) : null,
                'cases' => $cases,
                'fee_per_case' => $feePer,
                'total_fee' => $fee,
            ];
        }

        return [
            'period' => $period,
            'periodLabel' => AttendancePeriod::label($from, $to),
            'rows' => $out,
            'totals' => [
                'cases' => $totalCases,
                'fee' => $totalFee,
                'attenders' => count($out),
                'unmapped' => collect($out)->where('matched', false)->count(),
            ],
        ];
    }

    /** Employee self view: their own attend cases (detail) + fee in the period. */
    public function mine(Employee $employee, ?string $periodInput): array
    {
        [$period, $from, $to] = AttendancePeriod::resolve($periodInput);

        if (! $employee->erp_user_id) {
            return [
                'period' => $period,
                'periodLabel' => AttendancePeriod::label($from, $to),
                'mapped' => false,
                'entries' => [],
                'cases' => 0,
                'tier' => $employee->attend_tier,
                'tier_label' => null,
                'fee_per_case' => 0,
                'total_fee' => 0,
            ];
        }

        $p = $this->prefix();
        $entries = DB::connection($this->conn())->select(
            "SELECT t.id, t.ref, t.tanggal, t.waktu, t.jenis_tindakan, t.pasien, t.status
               FROM {$p}tindakan t
              WHERE t.nama_ts = ?
                AND t.tanggal BETWEEN ? AND ?
                AND t.entity IN ({$this->entities()})
              ORDER BY t.tanggal, t.waktu",
            [$employee->erp_user_id, $from->toDateString(), $to->toDateString()]
        );

        $tier = $employee->attend_tier;
        $fee = AttendCaseFee::query()->where('tier', $tier)->first();
        $feePer = $tier && $fee ? (float) $fee->fee : 0;

        return [
            'period' => $period,
            'periodLabel' => AttendancePeriod::label($from, $to),
            'mapped' => true,
            'entries' => array_map(fn ($e) => (array) $e, $entries),
            'cases' => count($entries),
            'tier' => $tier,
            'tier_label' => $fee?->label,
            'fee_per_case' => $feePer,
            'total_fee' => count($entries) * $feePer,
        ];
    }
}
