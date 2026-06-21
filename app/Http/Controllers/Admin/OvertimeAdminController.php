<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreOvertimeEntryRequest;
use App\Models\OvertimeEntry;
use App\Models\OvertimePeriod;
use App\Services\Overtime\OvertimeService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class OvertimeAdminController extends Controller
{
    public function __construct(private OvertimeService $service)
    {
    }

    /** Shared filtered query for the admin list + export (status / period / employee search). */
    private function filtered(Request $request)
    {
        $status = $request->string('status')->toString();
        $period = $request->string('period')->toString();
        $search = trim((string) $request->input('search', ''));

        return OvertimePeriod::query()
            ->with(['employee:id,full_name,employee_code'])
            ->when($status, fn ($q) => $q->where('status', $status))
            ->when($period, fn ($q) => $q->where('period', $period))
            ->when($search !== '', fn ($q) => $q->whereHas('employee', fn ($w) => $w
                ->where('full_name', 'like', "%{$search}%")->orWhere('employee_code', 'like', "%{$search}%")))
            ->orderByDesc('period')
            ->orderByDesc('submitted_at');
    }

    /** "Pengajuan Lembur" — HR monitoring of all employees' overtime periods. */
    public function index(Request $request): Response
    {
        $status = $request->string('status')->toString();
        $period = $request->string('period')->toString();
        $search = trim((string) $request->input('search', ''));

        return Inertia::render('overtime/admin', [
            'periods' => $this->filtered($request)->paginate(20)->withQueryString(),
            'filters' => ['status' => $status, 'period' => $period, 'search' => $search],
            'statuses' => [
                OvertimePeriod::STATUS_DRAFT, OvertimePeriod::STATUS_PENDING_SUPERVISOR, OvertimePeriod::STATUS_PENDING_HR,
                OvertimePeriod::STATUS_APPROVED, OvertimePeriod::STATUS_REJECTED,
            ],
        ]);
    }

    /**
     * Flatten the filtered periods into recap rows (one per non-rejected entry) + per-name
     * subtotals + grand total + pay-month title. Shared by the Excel export & recap PDF.
     */
    private function recapData(Request $request): array
    {
        $periods = $this->filtered($request)->with(['employee:id,full_name,employee_code', 'entries'])->get();

        $rows = [];
        foreach ($periods as $p) {
            $name = $p->employee?->full_name ?? '-';
            $payMonth = Carbon::parse($p->period_end);
            foreach ($p->entries as $e) {
                if ($e->status === OvertimeEntry::STATUS_REJECTED) {
                    continue;
                }
                $rows[] = [
                    'name' => $name,
                    'date' => $e->date,
                    'pay_month' => $payMonth,
                    'start' => Str::substr($e->start_time, 0, 5),
                    'end' => Str::substr($e->end_time, 0, 5),
                    'minutes' => $e->minutes,
                    'amount' => (float) $e->amount,
                    'is_holiday' => (bool) $e->is_holiday,
                ];
            }
        }

        usort($rows, fn ($a, $b) => [$a['name'], $a['date']->timestamp] <=> [$b['name'], $b['date']->timestamp]);

        $summary = [];
        foreach ($rows as $r) {
            $summary[$r['name']] = ($summary[$r['name']] ?? 0) + $r['amount'];
        }

        $first = $periods->first();
        $title = $first ? Carbon::parse($first->period_end)->locale('id')->translatedFormat('F Y') : '';

        return [
            'rows' => $rows,
            'summary' => $summary,
            'grand' => array_sum($summary),
            'titleMonth' => mb_strtoupper($title),
        ];
    }

    /** Export the recap (FORM REKAP LEMBUR layout) to an Excel-openable .xls. */
    public function export(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $data = $this->recapData($request);
        $esc = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES);
        $rp = fn ($v) => 'Rp '.number_format((float) $v, 0, ',', '.');
        $hm = fn ($min) => intdiv((int) $min, 60).':'.str_pad((string) ((int) $min % 60), 2, '0', STR_PAD_LEFT);
        $hdr = 'background:#1f2937;color:#fff;font-weight:bold;text-align:center;';
        $tbl = 'border-collapse:collapse;font-family:Calibri,Arial;font-size:12px;';

        $t = '<table border="1" cellspacing="0" cellpadding="4" style="'.$tbl.'">';
        $t .= '<tr style="'.$hdr.'"><th>No</th><th>Nama</th><th>Hari</th><th>Tanggal</th><th>Bulan</th><th>Jam Mulai</th><th>Jam Selesai</th><th>Jmlh Jam</th><th>Lembur/Jam</th></tr>';
        foreach ($data['rows'] as $i => $r) {
            $hl = $r['is_holiday'] ? 'background:#fde68a;font-weight:bold;' : '';
            $t .= '<tr style="'.$hl.'">'
                .'<td style="text-align:center;">'.($i + 1).'</td>'
                .'<td>'.$esc($r['name']).'</td>'
                .'<td>'.$r['date']->format('l').'</td>'
                .'<td style="text-align:center;">'.$r['date']->format('j-M-y').'</td>'
                .'<td style="text-align:center;">'.$r['pay_month']->format('M').'</td>'
                .'<td style="text-align:center;">'.$esc($r['start']).'</td>'
                .'<td style="text-align:center;">'.$esc($r['end']).'</td>'
                .'<td style="text-align:center;">'.$hm($r['minutes']).'</td>'
                .'<td style="text-align:right;">'.$rp($r['amount']).'</td>'
                .'</tr>';
        }
        $t .= '<tr style="font-weight:bold;background:#e5e7eb;"><td colspan="8" style="text-align:right;">TOTAL</td><td style="text-align:right;">'.$rp($data['grand']).'</td></tr>';
        $t .= '</table>';

        $s = '<table border="1" cellspacing="0" cellpadding="4" style="'.$tbl.'">';
        $s .= '<tr style="'.$hdr.'"><th>Nama</th><th>Sum of Lembur/Jam</th></tr>';
        foreach ($data['summary'] as $name => $amt) {
            $s .= '<tr><td>'.$esc($name).'</td><td style="text-align:right;">'.$rp($amt).'</td></tr>';
        }
        $s .= '<tr style="font-weight:bold;background:#e5e7eb;"><td>Grand Total</td><td style="text-align:right;">'.$rp($data['grand']).'</td></tr>';
        $s .= '</table>';

        $today = now()->format('j-M-y');
        $sign = '<table style="font-family:Calibri,Arial;font-size:12px;margin-top:16px;"><tr>'
            .'<td style="padding-right:60px;">Tangerang Selatan, '.$today.'<br><br>Diproses Oleh,<br><br><br><br><b>Marisa Syarifah</b></td>'
            .'<td style="vertical-align:bottom;">Mengetahui,<br><br><br><br><b>Dian Tika Mardhan</b></td></tr></table>';

        $doc = '<html><head><meta charset="UTF-8"></head><body>'
            .'<h2 style="font-family:Calibri,Arial;margin:0;">PT. MAPSON ARYA PARAHITA</h2>'
            .'<h3 style="font-family:Calibri,Arial;margin:4px 0 12px;">REKAP LEMBUR '.$esc($data['titleMonth']).'</h3>'
            .$t.'<br>'.$s.'<br>'.$sign
            .'</body></html>';

        return response($doc, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="rekap-lembur.xls"',
        ]);
    }

    /** Printable recap PDF (FORM REKAP LEMBUR) with the processing/approval signature block. */
    public function recapPdf(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $data = $this->recapData($request);

        $logoPath = public_path('images/logo.png');
        $logo = is_file($logoPath) ? 'data:image/png;base64,'.base64_encode((string) file_get_contents($logoPath)) : null;

        $pdf = Pdf::loadView('reports.overtime-recap', [
            'rows' => $data['rows'],
            'summary' => $data['summary'],
            'grand' => $data['grand'],
            'titleMonth' => $data['titleMonth'],
            'logo' => $logo,
            'today' => now()->locale('id')->translatedFormat('j F Y'),
            'signers' => [
                ['role' => 'Diproses Oleh,', 'name' => 'Marisa Syarifah'],
                ['role' => 'Mengetahui,', 'name' => 'Dian Tika Mardhan'],
            ],
        ])->setPaper('a4', 'portrait');

        return $pdf->download('rekap-lembur-'.now()->format('Y-m-d').'.pdf');
    }

    public function show(Request $request, OvertimePeriod $overtime): Response
    {
        $overtime->load(['employee:id,full_name,employee_code', 'entries', 'approvals.approver:id,full_name']);
        $overtime->setAttribute('can_act', $this->service->canApprove($overtime, $request->user()));
        $overtime->setAttribute('can_return', $this->service->canReturnToDraft($overtime, $request->user()));
        // Admin may add/edit "susulan" entries until HR's final approval.
        $overtime->setAttribute('can_edit_entries', $overtime->status !== OvertimePeriod::STATUS_APPROVED);

        return Inertia::render('overtime/show', ['overtime' => $overtime]);
    }

    /** Admin adds a (susulan) entry to an employee's period. */
    public function storeEntry(StoreOvertimeEntryRequest $request, OvertimePeriod $overtime): RedirectResponse
    {
        try {
            $this->service->addEntry($overtime, $request->validated());
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Entri lembur ditambahkan.');
    }

    public function updateEntry(StoreOvertimeEntryRequest $request, OvertimeEntry $entry): RedirectResponse
    {
        try {
            $this->service->updateEntry($entry, $request->validated());
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Entri lembur diperbarui.');
    }

    public function destroyEntry(OvertimeEntry $entry): RedirectResponse
    {
        try {
            $this->service->deleteEntry($entry);
        } catch (Throwable $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Entri lembur dihapus.');
    }
}
