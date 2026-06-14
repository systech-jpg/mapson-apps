<?php

namespace App\Support;

use App\Models\Menu;
use App\Models\User;
use Illuminate\Support\Collection;

class MenuService
{
    /**
     * Build the permitted, nested, ordered menu tree for a user, scoped to an area
     * ("reporting" or "backend").
     *
     * Super admins see every active menu in the area. Other users see a leaf only
     * when their role grants `view`, and a module only when it has ≥1 visible child.
     *
     * @return array<int, array<string, mixed>>
     */
    public function treeFor(User $user, string $area = 'backend'): array
    {
        $menus = Menu::query()->active()->where('area', $area)->ordered()->get();

        $byParent = $menus->groupBy(fn (Menu $menu) => $menu->parent_id ?? 0);

        return $this->build($byParent, 0, $user);
    }

    /**
     * The route name a user should land on: the reporting dashboard when they can
     * access it, otherwise their first reachable backend menu, falling back to the
     * dashboard.
     */
    public function landingRoute(User $user): string
    {
        if ($user->isSuperAdmin()) {
            return 'dashboard';
        }

        // First reachable reporting menu (e.g. Beranda for staff), then backend, then dashboard.
        return $this->firstRoute($user, 'reporting') ?? $this->firstRoute($user, 'backend') ?? 'dashboard';
    }

    /**
     * The first reachable leaf route name in an area, used as the landing page when
     * switching areas. Null when the user has no access to that area.
     */
    public function firstRoute(User $user, string $area): ?string
    {
        foreach ($this->flattenLeaves($this->treeFor($user, $area)) as $leaf) {
            if (! empty($leaf['route'])) {
                return $leaf['route'];
            }
        }

        return null;
    }

    /**
     * @param  Collection<int|string, Collection<int, Menu>>  $byParent
     * @return array<int, array<string, mixed>>
     */
    protected function build(Collection $byParent, int $parentId, User $user): array
    {
        $nodes = [];

        foreach ($byParent->get($parentId, collect()) as $menu) {
            $children = $this->build($byParent, $menu->id, $user);
            $isModule = $byParent->has($menu->id);

            if ($isModule && empty($children)) {
                continue;
            }

            if (! $isModule && ! $user->hasMenuAccess($menu->key, 'view')) {
                continue;
            }

            $nodes[] = [
                'key' => $menu->key,
                'title' => $menu->title,
                'route' => $menu->route,
                'icon' => $menu->icon,
                'children' => $children,
            ];
        }

        return $nodes;
    }

    /**
     * @param  array<int, array<string, mixed>>  $nodes
     * @return array<int, array<string, mixed>>
     */
    protected function flattenLeaves(array $nodes): array
    {
        $leaves = [];

        foreach ($nodes as $node) {
            if (! empty($node['children'])) {
                $leaves = array_merge($leaves, $this->flattenLeaves($node['children']));
            } else {
                $leaves[] = $node;
            }
        }

        return $leaves;
    }
}
