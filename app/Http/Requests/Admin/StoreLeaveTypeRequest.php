<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreLeaveTypeRequest extends FormRequest
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
        $id = $this->route('leave_type')?->id;

        return [
            'code' => ['required', 'string', 'max:30', Rule::unique('leave_types', 'code')->ignore($id)],
            'name' => ['required', 'string', 'max:255'],
            'unit' => ['required', 'in:day,hour'],
            'is_paid' => ['boolean'],
            'requires_balance' => ['boolean'],
            'requires_attachment' => ['boolean'],
            'allow_half_day' => ['boolean'],
            'gender_constraint' => ['required', 'in:any,male,female'],
            'default_quota' => ['required', 'numeric', 'min:0', 'max:999'],
            'accrual_method' => ['required', 'in:none,lump_sum,prorata,tenure_based'],
            'min_notice_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'max_consecutive_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'carry_over_max' => ['nullable', 'numeric', 'min:0', 'max:999'],
            'carry_over_expire_month' => ['nullable', 'integer', 'min:1', 'max:12'],
            'color' => ['nullable', 'string', 'max:16'],
            'is_active' => ['boolean'],
        ];
    }
}
