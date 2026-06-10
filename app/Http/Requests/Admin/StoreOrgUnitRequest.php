<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class StoreOrgUnitRequest extends FormRequest
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
            'company_id' => ['nullable', 'exists:companies,id'],
            'parent_id' => ['nullable', 'exists:org_units,id'],
            'code' => ['nullable', 'string', 'max:255', 'unique:org_units,code'],
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', 'in:division,directorate,department,section,team'],
            'cost_center_id' => ['nullable', 'exists:cost_centers,id'],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['boolean'],
        ];
    }
}
