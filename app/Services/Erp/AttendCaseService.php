<?php

namespace App\Services\Erp;

use App\Models\AttendCaseFee;
use App\Models\Employee;
use App\Support\AttendancePeriod;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Reads "attend case" data (medical actions) from the ERP table `{prefix}tindakan`.
 * The attending employee is `nama_ts` (an ERP user id, matched to employees via
 * `erp_user_id`). Fee = per-case tier fee, split between workday and "tanggal merah"
 * (Sat/Sun + national holidays). Tiers are parameterized (attend_case_fees). Tiers with
 * basis = 'invoice' are computed separately (handled later) → fee shown as not-computed.
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

    /** SQL fragment: TRUE when tanggal is a "tanggal merah" (Sat/Sun or a national holiday). */
    private function redDateSql(string $col, array $holidayDates): string
    {
        $in = $holidayDates ? "OR DATE({$col}) IN ('".implode("','", $holidayDates)."')" : '';

        return "(DAYOFWEEK({$col}) IN (1, 7) {$in})"; // 1=Sunday, 7=Saturday
    }

    /** @return array<int, string> Y-m-d national-holiday dates within the range. */
    private function holidayDates(string $from, string $to): array
    {
        return DB::table('leave_holidays')->whereBetween('date', [$from, $to])
            ->pluck('date')->map(fn ($d) => Carbon::parse($d)->toDateString())->values()->all();
    }

    /** Admin recap: all attenders, cases split workday vs tanggal merah, fee by tier. */
    public function recap(?string $periodInput): array
    {
        [$period, $from, $to] = AttendancePeriod::resolve($periodInput);
        $p = $this->prefix();
        $red = $this->redDateSql('t.tanggal', $this->holidayDates($from->toDateString(), $to->toDateString()));

        $rows = DB::connection($this->conn())->select(
            "SELECT t.nama_ts AS erp_user_id,
                    SUM(CASE WHEN {$red} THEN 1 ELSE 0 END) AS holiday_cases,
                    SUM(CASE WHEN {$red} THEN 0 ELSE 1 END) AS workday_cases,
                    COUNT(*) AS cases,
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
        $tiers = AttendCaseFee::all()->keyBy('tier');

        $out = [];
        $totalCases = 0;
        $totalFee = 0.0;
        foreach ($rows as $r) {
            $erpId = (int) $r->erp_user_id;
            $emp = $employees->get($erpId);
            $tier = $emp ? $tiers->get($emp->attend_tier) : null;
            $basis = $tier?->basis ?? AttendCaseFee::BASIS_TINDAKAN;
            $wc = (int) $r->workday_cases;
            $hc = (int) $r->holiday_cases;
            $cases = (int) $r->cases;

            $computed = $tier && $basis === AttendCaseFee::BASIS_TINDAKAN;
            $fee = $computed ? ($wc * (float) $tier->fee_workday + $hc * (float) $tier->fee_holiday) : 0.0;

            $totalCases += $cases;
            $totalFee += $fee;

            $out[] = [
                'erp_user_id' => $erpId,
                'employee_id' => $emp?->id,
                'name' => $emp?->full_name ?: ($r->erp_name ?: 'User #'.$erpId),
                'position' => $emp?->currentPosition?->name,
                'matched' => (bool) $emp,
                'tier' => $emp?->attend_tier,
                'tier_label' => $tier?->label,
                'basis' => $tier ? $basis : null,
                'workday_cases' => $wc,
                'holiday_cases' => $hc,
                'cases' => $cases,
                'fee' => $fee,
                'fee_computed' => $computed,
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

    /**
     * Per-attender tindakan detail (the "breakdown") for an ERP user id, with workday/
     * holiday split and tier fee applied. Shared by mine() and the admin drill-down.
     *
     * @return array{entries: array<int, mixed>, workday_cases: int, holiday_cases: int, total_fee: float, computed: bool}
     */
    private function entriesFor(int $erpUserId, Carbon $from, Carbon $to, ?AttendCaseFee $tier): array
    {
        $p = $this->prefix();
        $entries = DB::connection($this->conn())->select(
            "SELECT t.id, t.ref, t.tanggal, t.waktu, t.jenis_tindakan, t.pasien
               FROM {$p}tindakan t
              WHERE t.nama_ts = ?
                AND t.tanggal BETWEEN ? AND ?
                AND t.entity IN ({$this->entities()})
              ORDER BY t.tanggal, t.waktu",
            [$erpUserId, $from->toDateString(), $to->toDateString()]
        );

        $holidaySet = array_flip($this->holidayDates($from->toDateString(), $to->toDateString()));
        $computed = $tier && ($tier->basis ?? AttendCaseFee::BASIS_TINDAKAN) === AttendCaseFee::BASIS_TINDAKAN;

        $list = [];
        $wc = 0;
        $hc = 0;
        $total = 0.0;
        foreach ($entries as $e) {
            $d = Carbon::parse($e->tanggal);
            $isRed = $d->isoWeekday() >= 6 || isset($holidaySet[$d->toDateString()]);
            $isRed ? $hc++ : $wc++;
            $fee = $computed ? (float) ($isRed ? $tier->fee_holiday : $tier->fee_workday) : 0.0;
            $total += $fee;
            $list[] = [
                'id' => $e->id, 'ref' => $e->ref, 'tanggal' => $d->toDateString(), 'waktu' => $e->waktu,
                'jenis_tindakan' => $e->jenis_tindakan, 'pasien' => $e->pasien,
                'is_holiday' => $isRed, 'fee' => $fee,
            ];
        }

        return ['entries' => $list, 'workday_cases' => $wc, 'holiday_cases' => $hc, 'total_fee' => $total, 'computed' => $computed];
    }

    /** Employee self view: own attend cases (detail) split workday/holiday + fee. */
    public function mine(Employee $employee, ?string $periodInput): array
    {
        [$period, $from, $to] = AttendancePeriod::resolve($periodInput);
        $base = ['period' => $period, 'periodLabel' => AttendancePeriod::label($from, $to)];

        if (! $employee->erp_user_id) {
            return $base + ['mapped' => false, 'entries' => [], 'cases' => 0, 'workday_cases' => 0, 'holiday_cases' => 0,
                'tier' => $employee->attend_tier, 'tier_label' => null, 'basis' => null, 'fee_computed' => false, 'total_fee' => 0];
        }

        $tier = AttendCaseFee::where('tier', $employee->attend_tier)->first();
        $r = $this->entriesFor((int) $employee->erp_user_id, $from, $to, $tier);

        return $base + [
            'mapped' => true,
            'entries' => $r['entries'],
            'cases' => count($r['entries']),
            'workday_cases' => $r['workday_cases'],
            'holiday_cases' => $r['holiday_cases'],
            'tier' => $employee->attend_tier,
            'tier_label' => $tier?->label,
            'basis' => $tier?->basis,
            'fee_workday' => $tier ? (float) $tier->fee_workday : 0,
            'fee_holiday' => $tier ? (float) $tier->fee_holiday : 0,
            'fee_computed' => $r['computed'],
            'total_fee' => $r['total_fee'],
        ];
    }

    /** Admin drill-down: full tindakan breakdown for one attender (by ERP user id). */
    public function breakdown(int $erpUserId, ?string $periodInput): array
    {
        [$period, $from, $to] = AttendancePeriod::resolve($periodInput);
        $p = $this->prefix();

        $employee = Employee::where('erp_user_id', $erpUserId)->first();
        $u = DB::connection($this->conn())->table($p.'user')->where('rowid', $erpUserId)->first(['firstname', 'lastname']);
        $erpName = $u ? trim(($u->firstname ?? '').' '.($u->lastname ?? '')) : '';

        $tier = $employee ? AttendCaseFee::where('tier', $employee->attend_tier)->first() : null;
        $r = $this->entriesFor($erpUserId, $from, $to, $tier);

        return [
            'period' => $period,
            'periodLabel' => AttendancePeriod::label($from, $to),
            'erp_user_id' => $erpUserId,
            'name' => $employee?->full_name ?: ($erpName ?: 'User #'.$erpUserId),
            'matched' => (bool) $employee,
            'tier_label' => $tier?->label,
            'basis' => $tier?->basis,
            'fee_workday' => $tier ? (float) $tier->fee_workday : 0,
            'fee_holiday' => $tier ? (float) $tier->fee_holiday : 0,
            'fee_computed' => $r['computed'],
            'entries' => $r['entries'],
            'cases' => count($r['entries']),
            'workday_cases' => $r['workday_cases'],
            'holiday_cases' => $r['holiday_cases'],
            'total_fee' => $r['total_fee'],
        ];
    }
}
