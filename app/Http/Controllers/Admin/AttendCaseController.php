<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Erp\AttendCaseService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AttendCaseController extends Controller
{
    public function __construct(private AttendCaseService $service)
    {
    }

    /** Admin: recap of all attenders for a period (cases + tiered fee). */
    public function index(Request $request): Response
    {
        return Inertia::render('attend-case/admin', $this->service->recap($request->input('period')));
    }

    /** Admin: per-attender tindakan breakdown (drill-down from the recap). */
    public function breakdown(Request $request, int $erpUserId): Response
    {
        return Inertia::render('attend-case/breakdown', $this->service->breakdown($erpUserId, $request->input('period')));
    }

    /** Admin: export Excel — satu baris per item usage per tindakan (periode atau rentang tanggal). */
    public function export(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $data = $this->service->exportRows($request->input('period'), $validated['from'] ?? null, $validated['to'] ?? null);

        $esc = fn ($v) => htmlspecialchars((string) ($v ?? ''), ENT_QUOTES);
        $num = fn ($v) => $v === null ? '' : number_format((float) $v, 0, ',', '.');
        $hdr = 'background:#1f2937;color:#fff;font-weight:bold;text-align:center;';

        $html = '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Calibri,Arial;font-size:12px;">';
        $html .= '<tr style="'.$hdr.'"><th>No</th><th>No. Tindakan</th><th>Tanggal</th><th>Waktu</th><th>Rumah Sakit</th>'
            .'<th>Dokter</th><th>Nama TS</th><th>Jenis Tindakan</th><th>Pasien</th>'
            .'<th>No. Usage</th><th>Status Usage</th><th>Kode Item</th><th>Nama Item</th><th>Qty Kirim</th><th>Qty Pakai</th><th>Qty Kembali</th></tr>';

        $statusLabels = [0 => 'Draft', 1 => 'Validated', 2 => 'Ordered'];
        $no = 0;
        $prevId = null;
        foreach ($data['rows'] as $r) {
            $usageStatus = $r->usage_ref !== null ? ($statusLabels[(int) $r->usage_status] ?? (string) $r->usage_status) : '';
            $qtyReturn = $r->qty_sent !== null ? (float) $r->qty_sent - (float) $r->qty_used : null;
            if ($r->id !== $prevId) {
                $no++;
                $prevId = $r->id;
            }
            $html .= '<tr>'
                .'<td style="text-align:center;">'.$no.'</td>'
                .'<td>'.$esc($r->ref).'</td>'
                .'<td style="text-align:center;">'.$esc($r->tanggal).'</td>'
                .'<td style="text-align:center;">'.$esc($r->waktu).'</td>'
                .'<td>'.$esc($r->rumah_sakit).'</td>'
                .'<td>'.$esc($r->dokter).'</td>'
                .'<td>'.$esc($r->nama_ts).'</td>'
                .'<td>'.$esc($r->jenis_tindakan).'</td>'
                .'<td>'.$esc($r->pasien).'</td>'
                .'<td>'.$esc($r->usage_ref).'</td>'
                .'<td style="text-align:center;">'.$usageStatus.'</td>'
                .'<td>'.$esc($r->item_ref).'</td>'
                .'<td>'.$esc($r->item_label).'</td>'
                .'<td style="text-align:right;">'.$num($r->qty_sent).'</td>'
                .'<td style="text-align:right;">'.$num($r->qty_used).'</td>'
                .'<td style="text-align:right;">'.$num($qtyReturn).'</td>'
                .'</tr>';
        }
        $html .= '</table>';
        $doc = '<html><head><meta charset="UTF-8"></head><body><h3>Data Tindakan &amp; Usage — '.$esc($data['periodLabel']).'</h3>'.$html.'</body></html>';

        return response($doc, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="tindakan-usage-'.$data['period'].'.xls"',
        ]);
    }

    /** Employee self-service: my own attend cases for a period. */
    public function mine(Request $request): Response
    {
        $employee = $request->user()?->employee;

        if (! $employee) {
            return Inertia::render('attend-case/mine', [
                'employeeLinked' => false,
                'period' => $request->input('period') ?: now()->format('Y-m'),
            ]);
        }

        return Inertia::render('attend-case/mine', ['employeeLinked' => true] + $this->service->mine($employee, $request->input('period')));
    }
}
