<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreMenuRequest;
use App\Http\Requests\Admin\UpdateMenuRequest;
use App\Models\Menu;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class MenuController extends Controller
{
    public function index(): Response
    {
        $menus = Menu::query()->ordered()->get();

        return Inertia::render('menus/index', [
            'menus' => $menus,
        ]);
    }

    public function store(StoreMenuRequest $request): RedirectResponse
    {
        Menu::create($request->validated());

        return to_route('menus.index')->with('success', 'Menu berhasil dibuat.');
    }

    public function update(UpdateMenuRequest $request, Menu $menu): RedirectResponse
    {
        $menu->update($request->validated());

        return to_route('menus.index')->with('success', 'Menu berhasil diperbarui.');
    }

    public function destroy(Menu $menu): RedirectResponse
    {
        $menu->delete();

        return to_route('menus.index')->with('success', 'Menu berhasil dihapus.');
    }
}
