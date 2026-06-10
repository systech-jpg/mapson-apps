<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class StoreEmployeeRequest extends FormRequest
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
            // Identity / personal
            'employee_code' => ['required', 'string', 'max:255', 'unique:employees,employee_code'],
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['nullable', 'string', 'max:255'],
            'nik_ktp' => ['nullable', 'string', 'max:32', 'unique:employees,nik_ktp'],
            'npwp' => ['nullable', 'string', 'max:255'],
            'gender' => ['nullable', 'in:male,female'],
            'birth_place' => ['nullable', 'string', 'max:255'],
            'birth_date' => ['nullable', 'date'],
            'religion' => ['nullable', 'in:islam,kristen,katolik,hindu,buddha,konghucu,lainnya'],
            'marital_status' => ['nullable', 'in:single,married,divorced,widowed'],
            'nationality' => ['nullable', 'string', 'max:255'],
            'blood_type' => ['nullable', 'in:A,B,AB,O'],
            'bpjs_kesehatan_no' => ['nullable', 'string', 'max:255'],
            'bpjs_ketenagakerjaan_no' => ['nullable', 'string', 'max:255'],
            'is_active' => ['boolean'],
            'user_id' => ['nullable', 'exists:users,id', 'unique:employees,user_id'],

            // Initial assignment (hire)
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
            'employment_status' => ['nullable', 'in:active,probation,suspended,terminated,resigned,retired'],
            'reports_to_employee_id' => ['nullable', 'exists:employees,id'],
        ];
    }
}
