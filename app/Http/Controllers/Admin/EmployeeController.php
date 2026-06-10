<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ChangeAssignmentRequest;
use App\Http\Requests\Admin\StoreEmployeeRequest;
use App\Http\Requests\Admin\UpdateEmployeeRequest;
use App\Models\Company;
use App\Models\CostCenter;
use App\Models\Employee;
use App\Models\EmployeeGroup;
use App\Models\EmployeeSubgroup;
use App\Models\EmploymentType;
use App\Models\Job;
use App\Models\JobGrade;
use App\Models\Location;
use App\Models\OrgUnit;
use App\Models\Position;
use App\Models\User;
use App\Support\AssignmentService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class EmployeeController extends Controller
{
    public function __construct(protected AssignmentService $assignments)
    {
    }

    public function index(Request $request): Response
    {
        $search = $request->string('search')->toString();
        $orgUnitId = $request->integer('org_unit_id') ?: null;
        $status = $request->string('status')->toString();
        $trashed = $request->string('trashed')->toString();

        $employees = Employee::query()
            ->with(['currentOrgUnit:id,name', 'currentPosition:id,name'])
            ->when($trashed === 'with', fn ($q) => $q->withTrashed())
            ->when($trashed === 'only', fn ($q) => $q->onlyTrashed())
            ->when($search, fn ($q) => $q->where(function ($w) use ($search) {
                $w->where('full_name', 'like', "%{$search}%")
                    ->orWhere('employee_code', 'like', "%{$search}%")
                    ->orWhere('nik_ktp', 'like', "%{$search}%");
            }))
            ->when($orgUnitId, fn ($q) => $q->where('current_org_unit_id', $orgUnitId))
            ->when($status, fn ($q) => $q->where('current_employment_status', $status))
            ->orderBy('full_name')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('employees/index', [
            'employees' => $employees,
            'filters' => ['search' => $search, 'org_unit_id' => $orgUnitId, 'status' => $status, 'trashed' => $trashed],
            'orgUnits' => OrgUnit::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('employees/create', $this->formOptions());
    }

    public function store(StoreEmployeeRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $actor = $request->user();

        $employee = DB::transaction(function () use ($data, $actor) {
            $employee = Employee::create([
                'employee_code' => $data['employee_code'],
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'] ?? null,
                'full_name' => trim(($data['first_name'] ?? '').' '.($data['last_name'] ?? '')),
                'nik_ktp' => $data['nik_ktp'] ?? null,
                'npwp' => $data['npwp'] ?? null,
                'gender' => $data['gender'] ?? null,
                'birth_place' => $data['birth_place'] ?? null,
                'birth_date' => $data['birth_date'] ?? null,
                'religion' => $data['religion'] ?? null,
                'marital_status' => $data['marital_status'] ?? null,
                'nationality' => $data['nationality'] ?? 'WNI',
                'blood_type' => $data['blood_type'] ?? null,
                'bpjs_kesehatan_no' => $data['bpjs_kesehatan_no'] ?? null,
                'bpjs_ketenagakerjaan_no' => $data['bpjs_ketenagakerjaan_no'] ?? null,
                'hire_date' => $data['valid_from'],
                'is_active' => $data['is_active'] ?? true,
                'user_id' => $data['user_id'] ?? null,
                'created_by' => $actor?->id,
                'updated_by' => $actor?->id,
            ]);

            $this->assignments->hire($employee, $this->assignmentData($data), $actor);

            return $employee;
        });

        return to_route('employees.show', $employee)->with('success', 'Employee berhasil dibuat.');
    }

    public function show(Employee $employee): Response
    {
        $employee->load([
            'user:id,name,email',
            'creator:id,name',
            'reportsTo:id,full_name,employee_code',
            'currentCompany:id,name', 'currentOrgUnit:id,name', 'currentPosition:id,name',
            'currentJobGrade:id,name', 'currentLocation:id,name', 'currentEmployeeGroup:id,name',
            'currentEmployeeSubgroup:id,name', 'currentEmploymentType:id,name',
            'assignments.orgUnit:id,name', 'assignments.position:id,name', 'assignments.jobGrade:id,name',
            'assignments.company:id,name', 'assignments.location:id,name',
            'addresses', 'contacts', 'emergencyContacts', 'families', 'educations', 'experiences',
            'trainings', 'bankAccounts', 'documents.uploader:id,name',
            'auditLogs.user:id,name',
        ]);

        return Inertia::render('employees/show', [
            'employee' => $employee,
            ...$this->formOptions(),
        ]);
    }

    public function update(UpdateEmployeeRequest $request, Employee $employee): RedirectResponse
    {
        $data = $request->validated();

        $employee->fill([
            'employee_code' => $data['employee_code'],
            'first_name' => $data['first_name'],
            'last_name' => $data['last_name'] ?? null,
            'full_name' => trim(($data['first_name'] ?? '').' '.($data['last_name'] ?? '')),
            'nik_ktp' => $data['nik_ktp'] ?? null,
            'npwp' => $data['npwp'] ?? null,
            'gender' => $data['gender'] ?? null,
            'birth_place' => $data['birth_place'] ?? null,
            'birth_date' => $data['birth_date'] ?? null,
            'religion' => $data['religion'] ?? null,
            'marital_status' => $data['marital_status'] ?? null,
            'nationality' => $data['nationality'] ?? 'WNI',
            'blood_type' => $data['blood_type'] ?? null,
            'bpjs_kesehatan_no' => $data['bpjs_kesehatan_no'] ?? null,
            'bpjs_ketenagakerjaan_no' => $data['bpjs_ketenagakerjaan_no'] ?? null,
            'is_active' => $data['is_active'] ?? true,
            'user_id' => $data['user_id'] ?? null,
            'updated_by' => $request->user()?->id,
        ]);

        if ($request->hasFile('photo')) {
            if ($employee->photo_path) {
                Storage::disk('local')->delete($employee->photo_path);
            }
            $employee->photo_path = $request->file('photo')->store("employees/{$employee->id}/photo", 'local');
        }

        $employee->save();

        return back()->with('success', 'Data employee berhasil diperbarui.');
    }

    public function changeAssignment(ChangeAssignmentRequest $request, Employee $employee): RedirectResponse
    {
        $this->assignments->apply($employee, $request->validated(), $request->user());

        return back()->with('success', 'Penempatan employee berhasil diperbarui.');
    }

    public function destroy(Employee $employee): RedirectResponse
    {
        $employee->delete();

        return to_route('employees.index')->with('success', 'Employee berhasil dinonaktifkan (soft delete).');
    }

    public function restore(Employee $employee): RedirectResponse
    {
        $employee->restore();

        return back()->with('success', 'Employee berhasil dipulihkan.');
    }

    public function photo(Employee $employee): StreamedResponse
    {
        abort_unless($employee->photo_path && Storage::disk('local')->exists($employee->photo_path), 404);

        return Storage::disk('local')->response($employee->photo_path);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function assignmentData(array $data): array
    {
        return [
            'action_type' => 'hire',
            'valid_from' => $data['valid_from'],
            'company_id' => $data['company_id'] ?? null,
            'org_unit_id' => $data['org_unit_id'] ?? null,
            'position_id' => $data['position_id'] ?? null,
            'job_catalog_id' => $data['job_catalog_id'] ?? null,
            'job_grade_id' => $data['job_grade_id'] ?? null,
            'cost_center_id' => $data['cost_center_id'] ?? null,
            'location_id' => $data['location_id'] ?? null,
            'employee_group_id' => $data['employee_group_id'] ?? null,
            'employee_subgroup_id' => $data['employee_subgroup_id'] ?? null,
            'employment_type_id' => $data['employment_type_id'] ?? null,
            'employment_status' => $data['employment_status'] ?? 'active',
            'reports_to_employee_id' => $data['reports_to_employee_id'] ?? null,
            'reason' => 'Hire',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function formOptions(): array
    {
        return [
            'companies' => Company::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'orgUnits' => OrgUnit::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'positions' => Position::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'jobs' => Job::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'jobGrades' => JobGrade::where('is_active', true)->orderBy('level')->get(['id', 'name']),
            'costCenters' => CostCenter::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'locations' => Location::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'employeeGroups' => EmployeeGroup::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'employeeSubgroups' => EmployeeSubgroup::where('is_active', true)->orderBy('name')->get(['id', 'name', 'employee_group_id']),
            'employmentTypes' => EmploymentType::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'managers' => Employee::orderBy('full_name')->get(['id', 'full_name', 'employee_code']),
            'linkableUsers' => User::whereDoesntHave('employee')->orderBy('name')->get(['id', 'name', 'email']),
        ];
    }
}
