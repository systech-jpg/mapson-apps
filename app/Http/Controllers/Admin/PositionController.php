<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StorePositionRequest;
use App\Http\Requests\Admin\UpdatePositionRequest;
use App\Models\Company;
use App\Models\Job;
use App\Models\JobGrade;
use App\Models\Location;
use App\Models\OrgUnit;
use App\Models\Position;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class PositionController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('positions/index', [
            'positions' => Position::with(['orgUnit:id,name', 'job:id,name', 'jobGrade:id,name', 'location:id,name'])
                ->withCount('employees')
                ->orderBy('name')
                ->get(),
            'orgUnits' => OrgUnit::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'jobs' => Job::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'jobGrades' => JobGrade::where('is_active', true)->orderBy('level')->get(['id', 'name']),
            'locations' => Location::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'companies' => Company::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(StorePositionRequest $request): RedirectResponse
    {
        Position::create($request->validated());

        return to_route('positions.index')->with('success', 'Position berhasil dibuat.');
    }

    public function update(UpdatePositionRequest $request, Position $position): RedirectResponse
    {
        $position->update($request->validated());

        return to_route('positions.index')->with('success', 'Position berhasil diperbarui.');
    }

    public function destroy(Position $position): RedirectResponse
    {
        $position->delete();

        return to_route('positions.index')->with('success', 'Position berhasil dihapus.');
    }
}
