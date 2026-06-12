<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class StoreEmployeeContractRequest extends FormRequest
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
            'contract_type' => ['required', 'in:PKWT,PKWTT,probation'],
            'number' => ['nullable', 'string', 'max:255'],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'is_current' => ['boolean'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
