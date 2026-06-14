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
