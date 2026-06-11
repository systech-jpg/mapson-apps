<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\HadirrSetting;
use App\Services\Hadirr\HadirrSyncService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class AttendanceController extends Controller
{
    public function __construct(protected HadirrSyncService $sync)
    {
    }

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

        $lastSync = DB::table('hadirr_attendances')->max('synced_at');

        return Inertia::render('attendance/index', [
            'rows' => $rows,
            'filters' => ['from' => $from, 'to' => $to, 'search' => $search],
            'stats' => [
                'total' => DB::table('hadirr_attendances')->count(),
                'unmatched_employees' => DB::table('hadirr_employees')->whereNull('employee_id')->count(),
                'last_sync' => $lastSync,
            ],
            'connected' => HadirrSetting::current()->isConnected() || filled(HadirrSetting::current()->access_key),
        ]);
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
