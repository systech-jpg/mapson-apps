<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class UpdateAccurateSettingRequest extends FormRequest
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
            'base_url' => ['required', 'string', 'max:255'],
            'client_id' => ['nullable', 'string', 'max:255'],
            'client_secret' => ['nullable', 'string', 'max:1000'],
            'signature_secret' => ['nullable', 'string', 'max:1000'],
            'scope' => ['nullable', 'string', 'max:2000'],
            'access_token' => ['nullable', 'string', 'max:2000'],
            'refresh_token' => ['nullable', 'string', 'max:2000'],
            'database_id' => ['nullable', 'string', 'max:255'],
            'api_host' => ['nullable', 'string', 'max:255'],
            'session_id' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['boolean'],
        ];
    }
}
