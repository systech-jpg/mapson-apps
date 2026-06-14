<?php

namespace App\Models;

use App\Support\AssignmentService;
use App\Support\Concerns\Auditable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Employee extends Model
{
    use Auditable, SoftDeletes;

    /**
     * Snapshot columns are maintained by AssignmentService only — exclude from audit noise.
     *
     * @var array<int, string>
     */
    protected array $auditExcludeExtra = [
        'current_company_id', 'current_org_unit_id', 'current_position_id', 'current_job_catalog_id',
        'current_job_grade_id', 'current_cost_center_id', 'current_location_id', 'current_employee_group_id',
        'current_employee_subgroup_id', 'current_employment_type_id', 'current_employment_status',
        'reports_to_employee_id', 'current_effective_date',
    ];

    protected $fillable = [
        // Identity
        'user_id', 'employee_code', 'department_id', 'position_id', 'phone', 'hire_date', 'address', 'is_active',
        // Personal
        'first_name', 'last_name', 'full_name', 'nik_ktp', 'kk_number', 'npwp', 'gender', 'birth_place', 'birth_date',
        'religion', 'marital_status', 'ptkp_status', 'nationality', 'blood_type',
        'has_meal_allowance', 'has_transport_allowance', 'erp_user_id', 'attend_tier',
        'bpjs_kesehatan_no', 'bpjs_kesehatan_notes', 'bpjs_ketenagakerjaan_no', 'bpjs_ketenagakerjaan_notes', 'photo_path',
        // Snapshot (written by AssignmentService)
        'current_company_id', 'current_org_unit_id', 'current_position_id', 'current_job_catalog_id', 'current_job_grade_id',
        'current_cost_center_id', 'current_location_id', 'current_employee_group_id', 'current_employee_subgroup_id',
        'current_employment_type_id', 'current_employment_status', 'reports_to_employee_id', 'current_effective_date', 'termination_date',
        // Audit ownership
        'created_by', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'hire_date' => 'date',
            'birth_date' => 'date',
            'current_effective_date' => 'date',
            'termination_date' => 'date',
            'is_active' => 'boolean',
            'has_meal_allowance' => 'boolean',
            'has_transport_allowance' => 'boolean',
            'erp_user_id' => 'integer',
            'attend_tier' => 'integer',
        ];
    }

    protected function displayName(): Attribute
    {
        return Attribute::get(fn () => $this->full_name ?: trim("{$this->first_name} {$this->last_name}") ?: $this->employee_code);
    }

    /**
     * Apply a new effective-dated assignment (hire/transfer/promotion/etc).
     *
     * @param  array<string, mixed>  $data
     */
    public function setCurrentAssignment(array $data, ?User $actor = null): EmployeeAssignment
    {
        return app(AssignmentService::class)->apply($this, $data, $actor);
    }

    // --- Relations -------------------------------------------------------

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function reportsTo(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'reports_to_employee_id');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(EmployeeAssignment::class)->orderByDesc('valid_from')->orderByDesc('id');
    }

    public function currentAssignment(): HasOne
    {
        return $this->hasOne(EmployeeAssignment::class)->where('is_current', true);
    }

    // Current snapshot relations
    public function currentCompany(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'current_company_id');
    }

    public function currentOrgUnit(): BelongsTo
    {
        return $this->belongsTo(OrgUnit::class, 'current_org_unit_id');
    }

    public function currentPosition(): BelongsTo
    {
        return $this->belongsTo(Position::class, 'current_position_id');
    }

    public function currentJob(): BelongsTo
    {
        return $this->belongsTo(Job::class, 'current_job_catalog_id');
    }

    public function currentJobGrade(): BelongsTo
    {
        return $this->belongsTo(JobGrade::class, 'current_job_grade_id');
    }

    public function currentLocation(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'current_location_id');
    }

    public function currentEmployeeGroup(): BelongsTo
    {
        return $this->belongsTo(EmployeeGroup::class, 'current_employee_group_id');
    }

    public function currentEmployeeSubgroup(): BelongsTo
    {
        return $this->belongsTo(EmployeeSubgroup::class, 'current_employee_subgroup_id');
    }

    public function currentEmploymentType(): BelongsTo
    {
        return $this->belongsTo(EmploymentType::class, 'current_employment_type_id');
    }

    // Legacy (retired in cleanup phase)
    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function position(): BelongsTo
    {
        return $this->belongsTo(Position::class);
    }

    // Sub-modules
    public function addresses(): HasMany
    {
        return $this->hasMany(EmployeeAddress::class);
    }

    public function contacts(): HasMany
    {
        return $this->hasMany(EmployeeContact::class);
    }

    public function emergencyContacts(): HasMany
    {
        return $this->hasMany(EmergencyContact::class);
    }

    public function families(): HasMany
    {
        return $this->hasMany(EmployeeFamily::class);
    }

    public function educations(): HasMany
    {
        return $this->hasMany(EmployeeEducation::class);
    }

    public function experiences(): HasMany
    {
        return $this->hasMany(EmployeeExperience::class);
    }

    public function trainings(): HasMany
    {
        return $this->hasMany(EmployeeTraining::class);
    }

    public function bankAccounts(): HasMany
    {
        return $this->hasMany(EmployeeBankAccount::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(EmployeeDocument::class);
    }

    public function contracts(): HasMany
    {
        return $this->hasMany(EmployeeContract::class)->orderByDesc('start_date');
    }

    public function leaveRequests(): HasMany
    {
        return $this->hasMany(LeaveRequest::class)->orderByDesc('start_date');
    }

    public function leaveBalances(): HasMany
    {
        return $this->hasMany(LeaveBalance::class);
    }

    public function overtimePeriods(): HasMany
    {
        return $this->hasMany(OvertimePeriod::class)->orderByDesc('period');
    }

    public function auditLogs(): MorphMany
    {
        return $this->morphMany(AuditLog::class, 'auditable')->latest();
    }
}
