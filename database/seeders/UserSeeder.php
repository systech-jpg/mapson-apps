<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Employee;
use App\Models\EmployeeGroup;
use App\Models\EmploymentType;
use App\Models\JobGrade;
use App\Models\Location;
use App\Models\OrgUnit;
use App\Models\Position;
use App\Models\Role;
use App\Models\User;
use App\Support\AssignmentService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(AssignmentService $assignments): void
    {
        $company = Company::where('code', 'MAIN')->first();
        $orgUnit = OrgUnit::where('code', 'IT')->first();
        $position = Position::where('code', 'POS-SYSADMIN')->first();
        $grade = JobGrade::where('code', 'G4')->value('id');
        $location = Location::where('code', 'HO')->value('id');
        $group = EmployeeGroup::where('code', 'PERMANENT')->value('id');
        $type = EmploymentType::where('code', 'PKWTT')->value('id');

        $superAdminRole = Role::where('slug', 'super-admin')->firstOrFail();

        $user = User::updateOrCreate(
            ['email' => 'maharani@mapsonarya.com'],
            [
                'name' => 'Maharani',
                'password' => Hash::make('password'),
                'role_id' => $superAdminRole->id,
                'is_active' => true,
                'email_verified_at' => now(),
            ],
        );

        // Demo director account (reporting role → clean dashboard, no sidebar).
        if ($reportingRole = Role::where('slug', 'reporting')->first()) {
            User::updateOrCreate(
                ['email' => 'direksi@mapsonarya.com'],
                [
                    'name' => 'Direksi',
                    'password' => Hash::make('password'),
                    'role_id' => $reportingRole->id,
                    'is_active' => true,
                    'email_verified_at' => now(),
                ],
            );
        }

        $employee = Employee::updateOrCreate(
            ['employee_code' => 'EMP-0001'],
            [
                'user_id' => $user->id,
                'first_name' => 'Maharani',
                'full_name' => 'Maharani',
                'gender' => 'female',
                'nationality' => 'WNI',
                'hire_date' => now()->toDateString(),
                'is_active' => true,
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ],
        );

        $assignments->hire($employee, [
            'valid_from' => now()->toDateString(),
            'company_id' => $company?->id,
            'org_unit_id' => $orgUnit?->id,
            'position_id' => $position?->id,
            'job_grade_id' => $grade,
            'location_id' => $location,
            'employee_group_id' => $group,
            'employment_type_id' => $type,
            'employment_status' => 'active',
            'reason' => 'Initial seed',
        ], $user);

        // A decoupled employee (no login account) to prove the nullable path.
        $employee2 = Employee::updateOrCreate(
            ['employee_code' => 'EMP-0002'],
            [
                'user_id' => null,
                'first_name' => 'Budi',
                'last_name' => 'Santoso',
                'full_name' => 'Budi Santoso',
                'gender' => 'male',
                'nationality' => 'WNI',
                'hire_date' => now()->subYear()->toDateString(),
                'is_active' => true,
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ],
        );

        $assignments->hire($employee2, [
            'valid_from' => now()->subYear()->toDateString(),
            'company_id' => $company?->id,
            'org_unit_id' => $orgUnit?->id,
            'position_id' => $position?->id,
            'job_grade_id' => JobGrade::where('code', 'G1')->value('id'),
            'location_id' => $location,
            'employee_group_id' => $group,
            'employment_type_id' => $type,
            'employment_status' => 'active',
            'reason' => 'Initial seed',
        ], $user);
    }
}
