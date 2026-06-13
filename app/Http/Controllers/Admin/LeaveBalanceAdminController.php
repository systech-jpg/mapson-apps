<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveType;
use App\Services\Leave\EntitlementService;
use App\Services\Leave\LeaveBalanceService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class LeaveBalanceAdminController extends Controller
{
    public function __construct(
        private LeaveBalanceService $balances,
        private EntitlementService $entitlement,
    ) {
    }

    public function index(Request $request): Response
    {
        $year = $request->integer('year') ?: (int) now()->year;
        $search = trim((string) $request->input('search', ''));

        $types = LeaveType::where('is_active', true)->where('requires_balance', true)
            ->orderBy('sort_order')->get(['id', 'code', 'name']);

        $employees = Employee::query()
            ->where('is_active', true)
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('full_name', 'like', "%{$search}%")->orWhere('employee_code', 'like', "%{$search}%")))
            ->orderBy('full_name')
            ->paginate(20)
            ->withQueryString();

        $balanceRows = LeaveBalance::whereIn('employee_id', $employees->pluck('id'))
            ->where('year', $year)->get()
            ->groupBy('employee_id');

        $rows = $employees->getCollection()->map(function ($e) use ($balanceRows, $types) {
            $byType = ($balanceRows[$e->id] ?? collect())->keyBy('leave_type_id');

            return [
                'employee_id' => $e->id,
                'name' => $e->full_name,
                'code' => $e->employee_code,
                'balances' => $types->mapWithKeys(function ($t) use ($byType) {
                    $b = $byType[$t->id] ?? null;

                    return [$t->code => [
                        'available' => $b ? $this->balances->availableOf($b) : 0,
                        'allotted' => $b?->allotted ?? 0,
                        'used' => $b?->used ?? 0,
                        'pending' => $b?->pending ?? 0,
                    ]];
                }),
            ];
        });

        $employees->setCollection($rows);

        return Inertia::render('leave/admin/balances', [
            'year' => $year,
            'search' => $search,
            'types' => $types,
            'rows' => $employees,
        ]);
    }

    public function adjust(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'leave_type_id' => ['required', 'exists:leave_types,id'],
            'year' => ['required', 'integer', 'min:2000', 'max:2100'],
            'delta' => ['required', 'numeric', 'between:-365,365'],
        ]);

        $this->balances->adjust($data['employee_id'], $data['leave_type_id'], $data['year'], (float) $data['delta']);

        return back()->with('success', 'Saldo dikoreksi.');
    }

    public function accrue(Request $request): RedirectResponse
    {
        $year = $request->integer('year') ?: (int) now()->year;
        $count = $this->entitlement->accrueAll($year);

        return back()->with('success', "Akrual {$year} selesai: {$count} saldo diperbarui.");
    }
}
