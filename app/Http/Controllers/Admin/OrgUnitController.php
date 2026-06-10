<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreOrgUnitRequest;
use App\Http\Requests\Admin\UpdateOrgUnitRequest;
use App\Models\Company;
use App\Models\CostCenter;
use App\Models\OrgUnit;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class OrgUnitController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('org-units/index', [
            'orgUnits' => OrgUnit::with('company:id,name', 'parent:id,name')->orderBy('sort_order')->orderBy('name')->get(),
            'companies' => Company::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'costCenters' => CostCenter::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(StoreOrgUnitRequest $request): RedirectResponse
    {
        OrgUnit::create($request->validated());

        return to_route('org-units.index')->with('success', 'Organizational unit berhasil dibuat.');
    }

    public function update(UpdateOrgUnitRequest $request, OrgUnit $orgUnit): RedirectResponse
    {
        $orgUnit->update($request->validated());

        return to_route('org-units.index')->with('success', 'Organizational unit berhasil diperbarui.');
    }

    public function destroy(OrgUnit $orgUnit): RedirectResponse
    {
        $orgUnit->delete();

        return to_route('org-units.index')->with('success', 'Organizational unit berhasil dihapus.');
    }
}
