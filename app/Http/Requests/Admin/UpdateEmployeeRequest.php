<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateEmployeeRequest extends FormRequest
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
        $id = $this->route('employee')->id;

        return [
            'employee_code' => ['required', 'string', 'max:255', Rule::unique('employees', 'employee_code')->ignore($id)],
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['nullable', 'string', 'max:255'],
            'nik_ktp' => ['nullable', 'string', 'max:32', Rule::unique('employees', 'nik_ktp')->ignore($id)],
            'kk_number' => ['nullable', 'string', 'max:32'],
            'npwp' => ['nullable', 'string', 'max:255'],
            'gender' => ['nullable', 'in:male,female'],
            'birth_place' => ['nullable', 'string', 'max:255'],
            'birth_date' => ['nullable', 'date'],
            'religion' => ['nullable', 'in:islam,kristen,katolik,hindu,buddha,konghucu,lainnya'],
            'marital_status' => ['nullable', 'in:single,married,divorced,widowed'],
            'ptkp_status' => ['nullable', 'in:TK/0,TK/1,TK/2,TK/3,K/0,K/1,K/2,K/3'],
            'nationality' => ['nullable', 'string', 'max:255'],
            'blood_type' => ['nullable', 'in:A,B,AB,O'],
            'has_meal_allowance' => ['boolean'],
            'has_transport_allowance' => ['boolean'],
            'bpjs_kesehatan_no' => ['nullable', 'string', 'max:255'],
            'bpjs_kesehatan_notes' => ['nullable', 'string', 'max:500'],
            'bpjs_ketenagakerjaan_no' => ['nullable', 'string', 'max:255'],
            'bpjs_ketenagakerjaan_notes' => ['nullable', 'string', 'max:500'],
            'is_active' => ['boolean'],
            'user_id' => ['nullable', 'exists:users,id', Rule::unique('employees', 'user_id')->ignore($id)],
            'photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:2048'],
        ];
    }
}
