<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function readAll(Request $request): RedirectResponse
    {
        $request->user()->unreadNotifications->markAsRead();

        return back();
    }

    public function read(Request $request, string $id): RedirectResponse
    {
        $request->user()->notifications()->where('id', $id)->update(['read_at' => now()]);

        return back();
    }
}
