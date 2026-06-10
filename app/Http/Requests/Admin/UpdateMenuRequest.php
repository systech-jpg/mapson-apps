<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateMenuRequest extends FormRequest
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
        $menuId = $this->route('menu')->id;

        return [
            'parent_id' => ['nullable', 'exists:menus,id', Rule::notIn([$menuId])],
            'title' => ['required', 'string', 'max:255'],
            'key' => ['required', 'string', 'max:255', Rule::unique('menus', 'key')->ignore($menuId)],
            'route' => ['nullable', 'string', 'max:255'],
            'icon' => ['nullable', 'string', 'max:255'],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['boolean'],
        ];
    }
}
