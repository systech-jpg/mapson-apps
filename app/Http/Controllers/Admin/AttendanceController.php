<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\HadirrSetting;
use App\Services\Hadirr\HadirrSyncService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class AttendanceController extends Controller
{
    public function __construct(protected HadirrSyncService $sync)
    {
    }

    /** On-time deadline; later = late + annual-leave deduction. */
    private const DEADLINE = '09:00';

    private const FULL_DAY_AFTER = '12:00';   // > 12:00 → potong AL 1 hari (else 0.5)

    /** Short tags shown in the attendance-recap matrix (fallback: first 3 letters of code). */
    private const LEAVE_ABBR = [
        'ANNUAL' => 'AL', 'SICK' => 'SL', 'UNPAID' => 'UL', 'WFH' => 'WFH',
        'MARRIAGE' => 'MaL', 'MATERNITY' => 'MTL', 'PATERNITY' => 'PaL',
        'PERMISSION' => 'I', 'HALFDAY' => '½',
    ];

    /** Page 1: raw Hadirr pull (flat list) + date-range sync. */
    public function index(Request $request): Response
    {
        $from = $request->date('from')?->toDateString();
        $to = $request->date('to')?->toDateString();
        $search = trim((string) $request->input('search', ''));

        $rows = DB::table('hadirr_attendances as a')
            ->leftJoin('hadirr_employees as he', 'he.nik', '=', 'a.nik')
            ->leftJoin('employees as e', 'e.id', '=', 'he.employee_id')
            ->when($from, fn ($q) => $q->where('a.date', '>=', $from))
            ->when($to, fn ($q) => $q->where('a.date', '<=', $to))
            ->when($search !== '', fn ($q) => $q->where(function ($q) use ($search) {
                $q->where('a.name', 'like', "%{$search}%")
                    ->orWhere('a.nik', 'like', "%{$search}%")
                    ->orWhere('e.full_name', 'like', "%{$search}%");
            }))
            ->orderByDesc('a.date')
            ->orderBy('a.name')
            ->select([
                'a.id', 'a.nik', 'a.name', 'a.date', 'a.clock_in', 'a.clock_out',
                'a.overtime_in', 'a.overtime_out', 'a.clock_in_spot', 'a.clock_out_spot',
                'a.status', 'a.shift_name', 'a.notes',
                'e.id as employee_id', 'e.full_name as employee_name', 'e.employee_code',
                'he.match_method',
            ])
            ->paginate(25)
            ->withQueryString();

        return Inertia::render('attendance/index', [
            'rows' => $rows,
            'filters' => ['from' => $from, 'to' => $to, 'search' => $search],
            'stats' => [
                'total' => DB::table('hadirr_attendances')->count(),
                'unmatched_employees' => DB::table('hadirr_employees')->whereNull('employee_id')->count(),
                'last_sync' => DB::table('hadirr_attendances')->max('synced_at'),
            ],
            'connected' => HadirrSetting::current()->isConnected() || filled(HadirrSetting::current()->access_key),
        ]);
    }

    /** Page 2: attendance recap by clock-in time (matrix, lateness + AL rules). */
    public function hours(Request $request): Response
    {
        $r = $this->hoursReport($request->input('period'));

        return Inertia::render('attendance/hours', [
            'period' => $r['period'],
            'periodLabel' => $r['periodLabel'],
            'dates' => $r['dates'],
            'employees' => $r['employees'],
            'rules' => ['deadline' => self::DEADLINE, 'full' => self::FULL_DAY_AFTER],
            'stats' => [
                'unmatched_employees' => DB::table('hadirr_employees')->whereNull('employee_id')->count(),
                'last_sync' => DB::table('hadirr_attendances')->max('synced_at'),
            ],
            'connected' => HadirrSetting::current()->isConnected() || filled(HadirrSetting::current()->access_key),
        ]);
    }

    /** Export the recap matrix as an Excel-openable .xls (HTML table). */
    public function exportHours(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $r = $this->hoursReport($request->input('period'));
        $dates = $r['dates'];

        $esc = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES);
        $weekendBg = 'background:#fde8e8;';

        $hdr = 'background:#f1f5f9;font-weight:bold;text-align:center;';
        $bulanID = [1 => 'JANUARI', 2 => 'FEBRUARI', 3 => 'MARET', 4 => 'APRIL', 5 => 'MEI', 6 => 'JUNI', 7 => 'JULI', 8 => 'AGUSTUS', 9 => 'SEPTEMBER', 10 => 'OKTOBER', 11 => 'NOVEMBER', 12 => 'DESEMBER'];

        // Group consecutive dates by month for the top header row.
        $monthGroups = [];
        foreach ($dates as $d) {
            $c = Carbon::parse($d['date']);
            $label = $bulanID[$c->month].' '.$c->year;
            $n = count($monthGroups);
            if ($n > 0 && $monthGroups[$n - 1]['label'] === $label) {
                $monthGroups[$n - 1]['count']++;
            } else {
                $monthGroups[] = ['label' => $label, 'count' => 1];
            }
        }

        $html = '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Calibri,Arial;font-size:11px;">';

        // Header row 1: BULAN (fixed cols + summary span all 4 header rows).
        $html .= '<tr style="'.$hdr.'">';
        $html .= '<th rowspan="4">No</th><th rowspan="4" style="text-align:left;">Nama</th><th rowspan="4" style="text-align:left;">Jabatan</th>';
        foreach ($monthGroups as $g) {
            $html .= '<th colspan="'.($g['count'] * 2).'">'.$g['label'].'</th>';
        }
        $html .= '<th rowspan="4">Telat</th><th rowspan="4">Total Jam Telat</th><th rowspan="4">Potong Cuti</th><th rowspan="4">Overtime</th><th rowspan="4" style="text-align:left;">Keterangan</th></tr>';

        // Header row 2: HARI (day of week).
        $html .= '<tr style="'.$hdr.'">';
        foreach ($dates as $d) {
            $html .= '<th colspan="2" style="'.($d['weekend'] ? $weekendBg : '').'">'.$d['dow'].'</th>';
        }
        $html .= '</tr>';

        // Header row 3: TGL (date number).
        $html .= '<tr style="'.$hdr.'">';
        foreach ($dates as $d) {
            $html .= '<th colspan="2" style="'.($d['weekend'] ? $weekendBg : '').'">'.$d['day'].'</th>';
        }
        $html .= '</tr>';

        // Header row 4: IN / OUT.
        $html .= '<tr style="'.$hdr.'">';
        foreach ($dates as $d) {
            $wb = $d['weekend'] ? $weekendBg : '';
            $html .= '<th style="'.$wb.'">IN</th><th style="'.$wb.'">OUT</th>';
        }
        $html .= '</tr>';

        // Rows
        foreach ($r['employees'] as $i => $e) {
            $html .= '<tr>';
            $html .= '<td style="text-align:center;">'.($i + 1).'</td>';
            $html .= '<td>'.$esc($e['name']).'</td>';
            $html .= '<td>'.$esc($e['position'] ?? '').'</td>';
            foreach ($dates as $d) {
                $c = $e['cells'][$d['date']] ?? null;
                $style = 'text-align:center;'.($d['weekend'] ? $weekendBg : '');
                $inStyle = $style.($c && $c['late'] ? 'color:#dc2626;font-weight:bold;' : '');
                $html .= '<td style="'.$inStyle.'">'.($c && $c['t'] ? $esc($c['t']) : '').'</td>';
                $html .= '<td style="'.$style.'">'.($c && $c['o'] ? $esc($c['o']) : '').'</td>';
            }
            $html .= '<td style="text-align:center;">'.($e['late_count'] ?: '').'</td>';
            $html .= '<td style="text-align:center;">'.($e['late_count'] ? $esc($e['late_label']) : '').'</td>';
            $html .= '<td style="text-align:center;">'.($e['al_deduction'] > 0 ? $esc($e['al_deduction']) : '').'</td>';
            $html .= '<td style="text-align:center;">'.$esc($e['overtime_label']).'</td>';
            $html .= '<td>'.$esc($e['keterangan']).'</td>';
            $html .= '</tr>';
        }
        $html .= '</table>';

        $doc = '<html><head><meta charset="UTF-8"></head><body>'
            .'<h3>Rekap Absensi per Jam — '.$esc($r['periodLabel']).'</h3>'
            .$html
            .'<p style="font-size:10px;color:#666;">Aturan: masuk &gt; '.self::DEADLINE.' = telat (potong cuti ½ hari); &gt; '.self::FULL_DAY_AFTER.' = potong cuti 1 hari.</p>'
            .'</body></html>';

        $filename = 'rekap-absensi-'.$r['period'].'.xls';

        return response($doc, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    /**
     * Resolve the payroll attendance period: 20th of the start month .. 19th of the next.
     *
     * @return array{0: string, 1: Carbon, 2: Carbon} [period (Y-m), from, to]
     */
    private function resolvePeriod(?string $periodInput): array
    {
        $today = Carbon::today();
        $defaultStart = $today->day >= 20 ? $today->copy()->startOfMonth() : $today->copy()->subMonthNoOverflow()->startOfMonth();

        $period = (string) ($periodInput ?: $defaultStart->format('Y-m'));
        try {
            $startMonth = Carbon::createFromFormat('Y-m', $period)->startOfMonth();
        } catch (\Throwable) {
            $startMonth = $defaultStart;
            $period = $defaultStart->format('Y-m');
        }

        return [$period, $startMonth->copy()->day(20), $startMonth->copy()->addMonthNoOverflow()->day(19)];
    }

    /** Page 3: attendance recap for payroll (presence marks + leave categories + balance). */
    public function attendance(Request $request): Response
    {
        $r = $this->attendanceReport($request->input('period'));

        return Inertia::render('attendance/recap', $r + [
            'stats' => [
                'unmatched_employees' => DB::table('hadirr_employees')->whereNull('employee_id')->count(),
                'last_sync' => DB::table('hadirr_attendances')->max('synced_at'),
            ],
            'connected' => HadirrSetting::current()->isConnected() || filled(HadirrSetting::current()->access_key),
        ]);
    }

    /** Export the attendance recap as an Excel-openable .xls (HTML table). */
    public function exportAttendance(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $r = $this->attendanceReport($request->input('period'));
        $dates = $r['dates'];
        $typeCols = $r['typeCols'];

        $esc = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES);
        $weekendBg = 'background:#fde8e8;';
        $holidayBg = 'background:#fee2e2;';
        $hdr = 'background:#f1f5f9;font-weight:bold;text-align:center;';
        $sumHdr = 'background:#dcfce7;font-weight:bold;text-align:center;';
        $bulanID = [1 => 'JANUARI', 2 => 'FEBRUARI', 3 => 'MARET', 4 => 'APRIL', 5 => 'MEI', 6 => 'JUNI', 7 => 'JULI', 8 => 'AGUSTUS', 9 => 'SEPTEMBER', 10 => 'OKTOBER', 11 => 'NOVEMBER', 12 => 'DESEMBER'];

        // Group consecutive dates by month for the top header row.
        $monthGroups = [];
        foreach ($dates as $d) {
            $c = Carbon::parse($d['date']);
            $label = $bulanID[$c->month].' '.$c->year;
            $n = count($monthGroups);
            if ($n > 0 && $monthGroups[$n - 1]['label'] === $label) {
                $monthGroups[$n - 1]['count']++;
            } else {
                $monthGroups[] = ['label' => $label, 'count' => 1];
            }
        }

        // Summary columns spanning all 3 header rows.
        $sumThs = '<th rowspan="3" style="'.$sumHdr.'">Hadir</th><th rowspan="3" style="'.$sumHdr.'">LN</th><th rowspan="3" style="'.$sumHdr.'">Total Kehadiran</th>';
        foreach ($typeCols as $tc) {
            $sumThs .= '<th rowspan="3" style="'.$sumHdr.'" title="'.$esc($tc['label']).'">'.$esc($tc['abbr']).'</th>';
        }
        $sumThs .= '<th rowspan="3" style="'.$sumHdr.'">A (Alpha)</th><th rowspan="3" style="'.$sumHdr.'">Pemakaian Total Cuti</th><th rowspan="3" style="'.$sumHdr.'">Sisa Cuti</th>';

        $html = '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Calibri,Arial;font-size:11px;">';

        // Header row 1: BULAN.
        $html .= '<tr style="'.$hdr.'">';
        $html .= '<th rowspan="3">No</th><th rowspan="3" style="text-align:left;">Nama</th><th rowspan="3" style="text-align:left;">Jabatan</th>';
        foreach ($monthGroups as $g) {
            $html .= '<th colspan="'.$g['count'].'">'.$g['label'].'</th>';
        }
        $html .= $sumThs.'</tr>';

        // Header row 2: HARI.
        $html .= '<tr style="'.$hdr.'">';
        foreach ($dates as $d) {
            $bg = $d['holiday'] ? $holidayBg : ($d['weekend'] ? $weekendBg : '');
            $html .= '<th style="'.$bg.'">'.$d['dow'].'</th>';
        }
        $html .= '</tr>';

        // Header row 3: TGL.
        $html .= '<tr style="'.$hdr.'">';
        foreach ($dates as $d) {
            $bg = $d['holiday'] ? $holidayBg : ($d['weekend'] ? $weekendBg : '');
            $html .= '<th style="'.$bg.'">'.$d['day'].'</th>';
        }
        $html .= '</tr>';

        $num = fn ($v) => $v === null ? '' : rtrim(rtrim(number_format((float) $v, 1, ',', ''), '0'), ',');

        foreach ($r['employees'] as $i => $e) {
            $html .= '<tr>';
            $html .= '<td style="text-align:center;">'.($i + 1).'</td>';
            $html .= '<td>'.$esc($e['name']).'</td>';
            $html .= '<td>'.$esc($e['position'] ?? '').'</td>';
            foreach ($dates as $d) {
                $c = $e['cells'][$d['date']] ?? null;
                $bg = $d['holiday'] ? $holidayBg : ($d['weekend'] ? $weekendBg : '');
                $html .= '<td style="text-align:center;'.$bg.'">'.($c ? $esc($c['mark']) : '').'</td>';
            }
            $html .= '<td style="text-align:center;">'.$num($e['hadir']).'</td>';
            $html .= '<td style="text-align:center;">'.$num($e['ln']).'</td>';
            $html .= '<td style="text-align:center;font-weight:bold;">'.$num($e['total_kehadiran']).'</td>';
            foreach ($typeCols as $tc) {
                $v = $e['by_type'][$tc['code']] ?? 0;
                $html .= '<td style="text-align:center;">'.($v > 0 ? $num($v) : '').'</td>';
            }
            $html .= '<td style="text-align:center;">'.($e['alpha'] > 0 ? $num($e['alpha']) : '').'</td>';
            $html .= '<td style="text-align:center;">'.$num($e['pemakaian_cuti']).'</td>';
            $html .= '<td style="text-align:center;font-weight:bold;">'.$num($e['sisa_cuti']).'</td>';
            $html .= '</tr>';
        }
        $html .= '</table>';

        $legend = [];
        foreach ($typeCols as $tc) {
            $legend[] = $tc['abbr'].' = '.$tc['label'];
        }

        $doc = '<html><head><meta charset="UTF-8"></head><body>'
            .'<h3>Rekap Kehadiran — '.$esc($r['periodLabel']).'</h3>'
            .$html
            .'<p style="font-size:10px;color:#666;">✓ = Hadir · LN = Libur Nasional · A = Alpha (tanpa keterangan) · '.$esc(implode(' · ', $legend)).'.</p>'
            .'<p style="font-size:10px;color:#666;">Pemakaian Total Cuti = akumulasi cuti tahunan terpakai s/d tahun '.$r['year'].'; Sisa Cuti = saldo cuti tahunan tersisa.</p>'
            .'</body></html>';

        return response($doc, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="rekap-kehadiran-'.$r['period'].'.xls"',
        ]);
    }

    /**
     * Build the attendance-recap matrix: presence marks, leave categories, and annual balance.
     *
     * @return array{period: string, periodLabel: string, year: int, dates: array<int, mixed>, typeCols: array<int, mixed>, employees: array<int, mixed>}
     */
    private function attendanceReport(?string $periodInput): array
    {
        [$period, $from, $to] = $this->resolvePeriod($periodInput);
        $year = $from->year;
        $fromS = $from->toDateString();
        $toS = $to->toDateString();

        $holidays = DB::table('leave_holidays')
            ->whereBetween('date', [$fromS, $toS])
            ->pluck('name', 'date')->all();

        $dowLabel = [1 => 'S', 2 => 'S', 3 => 'R', 4 => 'K', 5 => 'J', 6 => 'S', 7 => 'M'];
        $dates = [];
        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
            $ds = $d->toDateString();
            $dates[] = [
                'date' => $ds,
                'day' => $d->day,
                'dow' => $dowLabel[$d->isoWeekday()],
                'weekend' => $d->isoWeekday() >= 6,
                'holiday' => isset($holidays[$ds]),
                'holiday_name' => $holidays[$ds] ?? null,
            ];
        }

        $types = DB::table('leave_types')->where('is_active', true)
            ->orderBy('sort_order')->get(['id', 'code', 'name', 'color']);
        $typeById = $types->keyBy('id');
        $typeCols = $types->map(fn ($t) => [
            'code' => $t->code,
            'abbr' => self::LEAVE_ABBR[$t->code] ?? strtoupper(substr($t->code, 0, 3)),
            'label' => $t->name,
            'color' => $t->color,
        ])->values()->all();
        $annualId = optional($types->firstWhere('code', 'ANNUAL'))->id;

        $roster = DB::table('hadirr_employees as he')
            ->leftJoin('employees as e', 'e.id', '=', 'he.employee_id')
            ->leftJoin('positions as p', 'p.id', '=', 'e.current_position_id')
            ->orderBy(DB::raw('COALESCE(e.full_name, he.name)'))
            ->get([
                'he.nik', 'he.name as hadirr_name', 'he.employee_id',
                'e.full_name as employee_name', 'e.employee_code', 'p.name as position',
            ]);

        // Presence (any clock-in) by nik + date.
        $present = [];
        foreach (DB::table('hadirr_attendances')->whereBetween('date', [$fromS, $toS])->whereNotNull('clock_in')->get(['nik', 'date']) as $a) {
            $present[$a->nik][$a->date] = true;
        }

        // Approved leave requests overlapping the period, grouped by employee.
        $leaveByEmp = [];
        foreach (DB::table('leave_requests')->where('status', 'approved')
            ->where('start_date', '<=', $toS)->where('end_date', '>=', $fromS)
            ->get(['employee_id', 'leave_type_id', 'start_date', 'end_date', 'day_part']) as $lv) {
            $leaveByEmp[$lv->employee_id][] = $lv;
        }

        // Annual balance: used = pemakaian YTD, available = sisa.
        $balByEmp = [];
        if ($annualId) {
            foreach (DB::table('leave_balances')->where('leave_type_id', $annualId)->where('year', $year)
                ->get(['employee_id', 'allotted', 'carried_over', 'used', 'pending', 'adjustment']) as $b) {
                $balByEmp[$b->employee_id] = [
                    'used' => (float) $b->used,
                    'available' => (float) $b->allotted + (float) $b->carried_over + (float) $b->adjustment - (float) $b->used - (float) $b->pending,
                ];
            }
        }

        $employees = $roster->map(function ($r) use ($dates, $present, $leaveByEmp, $typeById, $balByEmp) {
            $cells = [];
            $hadir = 0.0;       // ✓ present only (WFH excluded)
            $ln = 0;
            $alpha = 0.0;
            $byType = [];
            $empLeaves = $leaveByEmp[$r->employee_id] ?? [];

            foreach ($dates as $dt) {
                $ds = $dt['date'];

                if ($dt['holiday']) {
                    $cells[$ds] = ['mark' => 'LN', 'kind' => 'holiday'];
                    $ln++;

                    continue;
                }
                if ($dt['weekend']) {
                    $cells[$ds] = ['mark' => null, 'kind' => 'weekend'];

                    continue;
                }

                $covering = null;
                foreach ($empLeaves as $lv) {
                    if ($ds >= $lv->start_date && $ds <= $lv->end_date) {
                        $covering = $lv;
                        break;
                    }
                }

                if ($covering) {
                    $code = $typeById[$covering->leave_type_id]->code ?? 'CUTI';
                    $abbr = self::LEAVE_ABBR[$code] ?? strtoupper(substr($code, 0, 3));
                    $half = $covering->day_part !== 'full';
                    $val = $half ? 0.5 : 1.0;
                    $byType[$code] = ($byType[$code] ?? 0) + $val;
                    $cells[$ds] = ['mark' => $abbr.($half ? '½' : ''), 'kind' => $code === 'WFH' ? 'wfh' : 'leave'];
                } elseif (! empty($present[$r->nik][$ds])) {
                    $cells[$ds] = ['mark' => '✓', 'kind' => 'present'];
                    $hadir++;
                } else {
                    $cells[$ds] = ['mark' => 'A', 'kind' => 'alpha'];
                    $alpha++;
                }
            }

            $wfh = (float) ($byType['WFH'] ?? 0);
            $bal = $balByEmp[$r->employee_id] ?? null;

            return [
                'nik' => $r->nik,
                'name' => $r->employee_name ?? $r->hadirr_name,
                'code' => $r->employee_code,
                'position' => $r->position,
                'matched' => (bool) $r->employee_id,
                'cells' => $cells,
                'hadir' => $hadir,
                'ln' => $ln,
                'total_kehadiran' => $hadir + $wfh,   // WFH counts as kehadiran
                'by_type' => $byType,
                'alpha' => $alpha,
                'pemakaian_cuti' => $bal['used'] ?? null,
                'sisa_cuti' => $bal['available'] ?? null,
            ];
        })->values()->all();

        return [
            'period' => $period,
            'periodLabel' => $from->translatedFormat('d M Y').' – '.$to->translatedFormat('d M Y'),
            'year' => $year,
            'dates' => $dates,
            'typeCols' => $typeCols,
            'employees' => $employees,
        ];
    }

    /**
     * Build the period matrix (dates + per-employee cells & summaries).
     *
     * @return array{period: string, periodLabel: string, dates: array<int, array<string, mixed>>, employees: array<int, array<string, mixed>>}
     */
    private function hoursReport(?string $periodInput): array
    {
        [$period, $from, $to] = $this->resolvePeriod($periodInput);

        $dowLabel = [1 => 'S', 2 => 'S', 3 => 'R', 4 => 'K', 5 => 'J', 6 => 'S', 7 => 'M'];
        $dates = [];
        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
            $dates[] = [
                'date' => $d->toDateString(),
                'day' => $d->day,
                'dow' => $dowLabel[$d->isoWeekday()],
                'weekend' => $d->isoWeekday() >= 6,
            ];
        }

        $roster = DB::table('hadirr_employees as he')
            ->leftJoin('employees as e', 'e.id', '=', 'he.employee_id')
            ->leftJoin('positions as p', 'p.id', '=', 'e.current_position_id')
            ->orderBy(DB::raw('COALESCE(e.full_name, he.name)'))
            ->get([
                'he.nik', 'he.name as hadirr_name', 'he.employee_id',
                'e.full_name as employee_name', 'e.employee_code', 'p.name as position',
            ]);

        $att = DB::table('hadirr_attendances')
            ->whereBetween('date', [$from->toDateString(), $to->toDateString()])
            ->get(['nik', 'date', 'clock_in', 'clock_out', 'overtime_in', 'overtime_out']);

        $byNik = [];
        foreach ($att as $a) {
            $byNik[$a->nik][$a->date] = $this->computeCell($a);
        }

        $employees = $roster->map(function ($r) use ($byNik, $dates) {
            $cells = [];
            $lateCount = 0;
            $lateMinutes = 0;
            $alDeduction = 0.0;
            $overtimeMinutes = 0;

            foreach ($dates as $dt) {
                $cell = $byNik[$r->nik][$dt['date']] ?? null;
                $cells[$dt['date']] = $cell ? ['t' => $cell['time'], 'o' => $cell['out'], 'late' => $cell['late']] : null;
                if ($cell) {
                    if ($cell['late']) {
                        $lateCount++;
                        $lateMinutes += $cell['late_minutes'];
                        $alDeduction += $cell['al'];
                    }
                    $overtimeMinutes += $cell['overtime_minutes'];
                }
            }

            return [
                'nik' => $r->nik,
                'name' => $r->employee_name ?? $r->hadirr_name,
                'code' => $r->employee_code,
                'position' => $r->position,
                'matched' => (bool) $r->employee_id,
                'cells' => $cells,
                'late_count' => $lateCount,
                'late_label' => $this->hm($lateMinutes),
                'al_deduction' => $alDeduction,
                'overtime_label' => $overtimeMinutes > 0 ? $this->hm($overtimeMinutes) : '-',
                'keterangan' => $alDeduction > 0 ? 'Potong cuti '.rtrim(rtrim(number_format($alDeduction, 1), '0'), '.').' hari' : '',
            ];
        })->values()->all();

        return [
            'period' => $period,
            'periodLabel' => $from->translatedFormat('d M Y').' – '.$to->translatedFormat('d M Y'),
            'dates' => $dates,
            'employees' => $employees,
        ];
    }

    /**
     * Compute one day's cell: clock-in time, lateness, and annual-leave deduction.
     *
     * @return array{time: string|null, out: string|null, late: bool, late_minutes: int, al: float, overtime_minutes: int}
     */
    private function computeCell(object $a): array
    {
        $result = ['time' => null, 'out' => null, 'late' => false, 'late_minutes' => 0, 'al' => 0.0, 'overtime_minutes' => 0];

        if (filled($a->clock_out)) {
            $result['out'] = Carbon::parse($a->clock_out)->format('H:i');
        }

        if (filled($a->clock_in)) {
            $in = Carbon::parse($a->clock_in);
            $result['time'] = $in->format('H:i');
            $deadline = $in->copy()->setTimeFromTimeString(self::DEADLINE);

            if ($in->gt($deadline)) {
                $result['late'] = true;
                $result['late_minutes'] = (int) $deadline->diffInMinutes($in);
                $noon = $in->copy()->setTimeFromTimeString(self::FULL_DAY_AFTER);
                $result['al'] = $in->gt($noon) ? 1.0 : 0.5;
            }
        }

        if (filled($a->overtime_in) && filled($a->overtime_out)) {
            $result['overtime_minutes'] = (int) Carbon::parse($a->overtime_in)->diffInMinutes(Carbon::parse($a->overtime_out));
        }

        return $result;
    }

    /** Minutes → "Xj Ym" (or "Ym"). */
    private function hm(int $minutes): string
    {
        $h = intdiv($minutes, 60);
        $m = $minutes % 60;

        return $h > 0 ? "{$h}j {$m}m" : "{$m}m";
    }

    /** Sync employees + attendances for a date range (web-triggered, max 31 days). */
    public function sync(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
        ]);

        $from = \Illuminate\Support\Carbon::parse($data['from']);
        $to = \Illuminate\Support\Carbon::parse($data['to']);
        if ($from->diffInDays($to) > 31) {
            return back()->with('error', 'Maksimal 31 hari per sinkronisasi. Untuk rentang besar gunakan command hadirr:sync-attendance.');
        }

        try {
            $emp = $this->sync->syncEmployees();
            $att = $this->sync->syncAttendances($from->toDateString(), $to->toDateString());
        } catch (\Throwable $e) {
            return back()->with('error', 'Sinkronisasi gagal: '.$e->getMessage());
        }

        return back()->with('success', sprintf(
            'Sinkron selesai: %d baris absensi (%d hari). Karyawan Hadirr: %d, terpetakan: %d.',
            $att['rows'], $att['days'], $emp['total'], $emp['matched']
        ));
    }
}
