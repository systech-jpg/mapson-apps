<?php

namespace App\Http\Middleware;

use App\Support\MenuService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        [$message, $author] = str(Inspiring::quotes()->random())->explode('-');

        $user = $request->user();

        if ($user) {
            $user->loadMissing('role.menus', 'employee');
        }

        $isSuperAdmin = (bool) $user?->isSuperAdmin();

        $menuService = app(MenuService::class);
        $reportingMenu = $user ? $menuService->treeFor($user, 'reporting') : [];
        $backendMenu = $user ? $menuService->treeFor($user, 'backend') : [];

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'logo' => asset('images/logo.png'),
            'quote' => ['message' => trim($message), 'author' => trim($author)],
            'auth' => [
                'user' => $user,
            ],
            'isSuperAdmin' => $isSuperAdmin,
            // Super admins rely on the flag and skip shipping a full map.
            'permissions' => ($user && ! $isSuperAdmin) ? $user->permissionMap() : (object) [],
            // Two "areas" (apps): each shell shows only its own menus.
            'reportingMenu' => $reportingMenu,
            'backendMenu' => $backendMenu,
            'canReporting' => count($reportingMenu) > 0,
            'canBackend' => count($backendMenu) > 0,
            'backendLanding' => $user ? $menuService->firstRoute($user, 'backend') : null,
            'flash' => [
                'success' => $request->session()->get('success'),
                'error' => $request->session()->get('error'),
            ],
            'notifications' => $user ? [
                'unread' => $user->unreadNotifications()->count(),
                'items' => $user->notifications()->latest()->limit(10)->get()->map(fn ($n) => [
                    'id' => $n->id,
                    'data' => $n->data,
                    'read' => $n->read_at !== null,
                    'at' => $n->created_at?->diffForHumans(),
                ]),
            ] : null,
        ];
    }
}
