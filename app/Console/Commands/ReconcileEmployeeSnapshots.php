<?php

namespace App\Console\Commands;

use App\Models\Employee;
use Illuminate\Console\Command;

class ReconcileEmployeeSnapshots extends Command
{
    protected $signature = 'hr:reconcile-snapshots';

    protected $description = 'Rebuild employees.current_* snapshot columns from each employee current assignment.';

    public function handle(): int
    {
        $count = 0;

        Employee::with('currentAssignment')->chunkById(100, function ($employees) use (&$count) {
            foreach ($employees as $employee) {
                $a = $employee->currentAssignment;

                if (! $a) {
                    continue;
                }

                $employee->forceFill([
                    'current_company_id' => $a->company_id,
                    'current_org_unit_id' => $a->org_unit_id,
                    'current_position_id' => $a->position_id,
                    'current_job_catalog_id' => $a->job_catalog_id,
                    'current_job_grade_id' => $a->job_grade_id,
                    'current_cost_center_id' => $a->cost_center_id,
                    'current_location_id' => $a->location_id,
                    'current_employee_group_id' => $a->employee_group_id,
                    'current_employee_subgroup_id' => $a->employee_subgroup_id,
                    'current_employment_type_id' => $a->employment_type_id,
                    'current_employment_status' => $a->employment_status,
                    'reports_to_employee_id' => $a->reports_to_employee_id,
                    'current_effective_date' => $a->valid_from,
                ])->saveQuietly();

                $count++;
            }
        });

        $this->info("Reconciled {$count} employee snapshot(s).");

        return self::SUCCESS;
    }
}
