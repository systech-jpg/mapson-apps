<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePositionRequest extends FormRequest
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
        $id = $this->route('position')->id;

        return [
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:255'],
            'company_id' => ['nullable', 'exists:companies,id'],
            'org_unit_id' => ['nullable', 'exists:org_units,id'],
            'job_catalog_id' => ['nullable', 'exists:job_catalogs,id'],
            'job_grade_id' => ['nullable', 'exists:job_grades,id'],
            'location_id' => ['nullable', 'exists:locations,id'],
            'reports_to_position_id' => ['nullable', 'exists:positions,id', Rule::notIn([$id])],
            'headcount' => ['nullable', 'integer', 'min:1'],
            'is_active' => ['boolean'],
        ];
    }
}
