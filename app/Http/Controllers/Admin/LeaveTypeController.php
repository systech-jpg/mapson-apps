<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreLeaveTypeRequest;
use App\Models\LeaveType;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class LeaveTypeController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('leave/admin/types', [
            'types' => LeaveType::orderBy('sort_order')->orderBy('name')->get(),
        ]);
    }

    public function store(StoreLeaveTypeRequest $request): RedirectResponse
    {
        LeaveType::create($request->validated());

        return back()->with('success', 'Jenis cuti dibuat.');
    }

    public function update(StoreLeaveTypeRequest $request, LeaveType $leave_type): RedirectResponse
    {
        $leave_type->update($request->validated());

        return back()->with('success', 'Jenis cuti diperbarui.');
    }

    public function destroy(LeaveType $leave_type): RedirectResponse
    {
        if ($leave_type->requests()->exists() || $leave_type->balances()->exists()) {
            $leave_type->update(['is_active' => false]);

            return back()->with('success', 'Jenis cuti masih dipakai — dinonaktifkan (tidak dihapus).');
        }

        $leave_type->delete();

        return back()->with('success', 'Jenis cuti dihapus.');
    }
}
