<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Copy any existing `departments` rows into `org_units`, repoint positions,
     * and backfill the employee snapshot + an initial "hire" assignment.
     *
     * On a fresh install `departments` is empty (migrations run before seeders),
     * so this is a no-op there — the HR seeders create org units directly.
     */
    public function up(): void
    {
        $departments = DB::table('departments')->get();

        if ($departments->isEmpty()) {
            return;
        }

        DB::transaction(function () use ($departments) {
            $now = now();

            $companyId = DB::table('companies')->value('id');
            if (! $companyId) {
                $companyId = DB::table('companies')->insertGetId([
                    'code' => 'MAIN',
                    'name' => config('app.name', 'Company'),
                    'is_active' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            $map = [];
            foreach ($departments as $dept) {
                $map[$dept->id] = DB::table('org_units')->insertGetId([
                    'company_id' => $companyId,
                    'parent_id' => null,
                    'code' => $dept->code,
                    'name' => $dept->name,
                    'type' => 'department',
                    'is_active' => $dept->is_active,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            DB::table('positions')->whereNotNull('department_id')->get()->each(function ($pos) use ($map, $companyId) {
                DB::table('positions')->where('id', $pos->id)->update([
                    'org_unit_id' => $map[$pos->department_id] ?? null,
                    'company_id' => $companyId,
                ]);
            });

            DB::table('employees')->get()->each(function ($emp) use ($map, $companyId, $now) {
                $orgUnitId = $emp->department_id ? ($map[$emp->department_id] ?? null) : null;
                $fullName = $emp->user_id ? DB::table('users')->where('id', $emp->user_id)->value('name') : null;
                $effective = $emp->hire_date ?? $now->toDateString();

                DB::table('employees')->where('id', $emp->id)->update([
                    'full_name' => $fullName,
                    'current_company_id' => $companyId,
                    'current_org_unit_id' => $orgUnitId,
                    'current_position_id' => $emp->position_id,
                    'current_employment_status' => 'active',
                    'current_effective_date' => $effective,
                ]);

                DB::table('employee_assignments')->insert([
                    'employee_id' => $emp->id,
                    'action_type' => 'hire',
                    'company_id' => $companyId,
                    'org_unit_id' => $orgUnitId,
                    'position_id' => $emp->position_id,
                    'employment_status' => 'active',
                    'valid_from' => $effective,
                    'valid_to' => null,
                    'is_current' => true,
                    'reason' => 'Initial data migration',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            });
        });
    }

    public function down(): void
    {
        // Data migration — not reversed (org_units rows are retained).
    }
};
