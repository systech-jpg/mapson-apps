<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateRoleAccessRequest;
use App\Models\Menu;
use App\Models\Role;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

class RoleAccessController extends Controller
{
    public function edit(Role $role): Response
    {
        $menus = Menu::query()->ordered()->get();
        $byParent = $menus->groupBy(fn (Menu $menu) => $menu->parent_id ?? 0);

        $existing = $role->menus()->get()->mapWithKeys(fn (Menu $menu) => [
            $menu->id => [
                'can_view' => (bool) $menu->pivot->can_view,
                'can_create' => (bool) $menu->pivot->can_create,
                'can_edit' => (bool) $menu->pivot->can_edit,
                'can_delete' => (bool) $menu->pivot->can_delete,
            ],
        ]);

        return Inertia::render('roles/access', [
            'role' => $role->only(['id', 'name', 'is_super']),
            'menuTree' => $this->buildTree($byParent, 0),
            'permissions' => $existing,
        ]);
    }

    public function update(UpdateRoleAccessRequest $request, Role $role): RedirectResponse
    {
        $sync = [];

        foreach ($request->validated('permissions') as $permission) {
            $create = (bool) ($permission['can_create'] ?? false);
            $edit = (bool) ($permission['can_edit'] ?? false);
            $delete = (bool) ($permission['can_delete'] ?? false);
            $view = (bool) ($permission['can_view'] ?? false) || $create || $edit || $delete;

            // Skip menus with no access at all to keep the pivot lean.
            if (! $view && ! $create && ! $edit && ! $delete) {
                continue;
            }

            $sync[$permission['menu_id']] = [
                'can_view' => $view,
                'can_create' => $create,
                'can_edit' => $edit,
                'can_delete' => $delete,
            ];
        }

        $role->menus()->sync($sync);

        return to_route('roles.index')->with('success', 'Hak akses role berhasil disimpan.');
    }

    /**
     * @param  Collection<int|string, Collection<int, Menu>>  $byParent
     * @return array<int, array<string, mixed>>
     */
    protected function buildTree(Collection $byParent, int $parentId): array
    {
        $nodes = [];

        foreach ($byParent->get($parentId, collect()) as $menu) {
            $children = $this->buildTree($byParent, $menu->id);

            $nodes[] = [
                'id' => $menu->id,
                'key' => $menu->key,
                'title' => $menu->title,
                'is_module' => $children !== [],
                'children' => $children,
            ];
        }

        return $nodes;
    }
}
