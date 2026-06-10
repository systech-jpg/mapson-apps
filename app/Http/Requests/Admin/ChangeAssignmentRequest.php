<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class ChangeAssignmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'action_type' => ['required', 'in:hire,transfer,promotion,demotion,status_change,reorg,termination'],
            'valid_from' => ['required', 'date'],
            'company_id' => ['nullable', 'exists:companies,id'],
            'org_unit_id' => ['nullable', 'exists:org_units,id'],
            'position_id' => ['nullable', 'exists:positions,id'],
            'job_catalog_id' => ['nullable', 'exists:job_catalogs,id'],
            'job_grade_id' => ['nullable', 'exists:job_grades,id'],
            'cost_center_id' => ['nullable', 'exists:cost_centers,id'],
            'location_id' => ['nullable', 'exists:locations,id'],
            'employee_group_id' => ['nullable', 'exists:employee_groups,id'],
            'employee_subgroup_id' => ['nullable', 'exists:employee_subgroups,id'],
            'employment_type_id' => ['nullable', 'exists:employment_types,id'],
            'employment_status' => ['required', 'in:active,probation,suspended,terminated,resigned,retired'],
            'reports_to_employee_id' => ['nullable', 'exists:employees,id'],
            'reason' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
