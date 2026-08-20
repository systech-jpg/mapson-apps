<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class StoreOvertimeEntryRequest extends FormRequest
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
        $dateRules = ['required', 'date'];

        // Karyawan (Lembur Saya) boleh backdate maksimal 30 hari; jalur HR admin bebas.
        if ($this->routeIs('overtime.entries.*')) {
            $dateRules[] = 'after_or_equal:'.now()->subDays(30)->toDateString();
        }

        return [
            'date' => $dateRules,
            'activity' => ['required', 'string', 'max:255'],
            'start_time' => ['required', 'date_format:H:i'],
            'end_time' => ['required', 'date_format:H:i'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'date.after_or_equal' => 'Tanggal lembur maksimal mundur 30 hari dari hari ini.',
        ];
    }
}
