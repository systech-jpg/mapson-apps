<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureMenuAccess
{
    /**
     * Ensure the authenticated user's role grants the given action on the menu.
     *
     * Usage: ->middleware('menu.access:users,create')
     */
    public function handle(Request $request, Closure $next, string $key, string $action = 'view'): Response
    {
        $user = $request->user();

        if (! $user) {
            abort(403);
        }

        if (! $user->hasMenuAccess($key, $action)) {
            abort(403);
        }

        return $next($request);
    }
}
