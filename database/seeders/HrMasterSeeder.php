<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\CostCenter;
use App\Models\EmployeeGroup;
use App\Models\EmployeeSubgroup;
use App\Models\EmploymentType;
use App\Models\Job;
use App\Models\JobGrade;
use App\Models\Location;
use App\Models\OrgUnit;
use App\Models\Position;
use Illuminate\Database\Seeder;

class HrMasterSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::updateOrCreate(
            ['code' => 'MAIN'],
            ['name' => config('app.name', 'Mapson Arya'), 'legal_name' => 'PT Mapson Arya', 'is_active' => true],
        );

        CostCenter::updateOrCreate(
            ['code' => 'CC-GEN'],
            ['company_id' => $company->id, 'name' => 'General', 'is_active' => true],
        );

        Location::updateOrCreate(
            ['code' => 'HO'],
            ['company_id' => $company->id, 'name' => 'Head Office', 'city' => 'Jakarta', 'is_active' => true],
        );

        $grades = [
            ['code' => 'G1', 'name' => 'Grade 1 - Staff', 'level' => 1],
            ['code' => 'G2', 'name' => 'Grade 2 - Senior Staff', 'level' => 2],
            ['code' => 'G3', 'name' => 'Grade 3 - Supervisor', 'level' => 3],
            ['code' => 'G4', 'name' => 'Grade 4 - Manager', 'level' => 4],
            ['code' => 'G5', 'name' => 'Grade 5 - Director', 'level' => 5],
        ];
        foreach ($grades as $g) {
            JobGrade::updateOrCreate(['code' => $g['code']], $g + ['is_active' => true]);
        }

        $groups = [
            'PERMANENT' => 'Permanent',
            'CONTRACT' => 'Contract',
            'INTERN' => 'Intern',
            'OUTSOURCE' => 'Outsource',
        ];
        foreach ($groups as $code => $name) {
            $group = EmployeeGroup::updateOrCreate(['code' => $code], ['name' => $name, 'is_active' => true]);

            foreach (['STAFF' => 'Staff', 'MGMT' => 'Management'] as $sc => $sn) {
                EmployeeSubgroup::updateOrCreate(
                    ['code' => $code.'-'.$sc],
                    ['employee_group_id' => $group->id, 'name' => $sn, 'is_active' => true],
                );
            }
        }

        $types = [
            'PKWTT' => 'PKWTT (Tetap)',
            'PKWT' => 'PKWT (Kontrak)',
            'MAGANG' => 'Magang / Internship',
            'HARIAN' => 'Harian Lepas',
        ];
        foreach ($types as $code => $name) {
            EmploymentType::updateOrCreate(['code' => $code], ['name' => $name, 'is_active' => true]);
        }

        $orgUnit = OrgUnit::updateOrCreate(
            ['code' => 'IT'],
            ['company_id' => $company->id, 'name' => 'Information Technology', 'type' => 'department', 'is_active' => true],
        );

        $job = Job::updateOrCreate(
            ['code' => 'SYSADMIN'],
            ['name' => 'System Administrator', 'job_grade_id' => JobGrade::where('code', 'G3')->value('id'), 'is_active' => true],
        );

        Position::updateOrCreate(
            ['code' => 'POS-SYSADMIN'],
            [
                'name' => 'System Administrator',
                'company_id' => $company->id,
                'org_unit_id' => $orgUnit->id,
                'job_catalog_id' => $job->id,
                'job_grade_id' => JobGrade::where('code', 'G3')->value('id'),
                'location_id' => Location::where('code', 'HO')->value('id'),
                'is_active' => true,
            ],
        );
    }
}
