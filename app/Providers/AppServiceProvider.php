<?php

namespace App\Providers;

use App\Models\User;
use App\Repositories\Contracts\HolidayRepositoryInterface;
use App\Repositories\Eloquent\EloquentHolidayRepository;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Leave Management repositories (repository pattern → swappable/mocking).
        $this->app->bind(HolidayRepositoryInterface::class, EloquentHolidayRepository::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // When APP_URL is https, force generated URLs (incl. OAuth redirect_uri) to
        // https even if the app sits behind an SSL-terminating proxy.
        if (str_starts_with((string) config('app.url'), 'https://')) {
            URL::forceScheme('https');
        }

        // Super admins bypass every authorization check. Returning null lets
        // non-super users fall through to the normal gate/policy resolution.
        Gate::before(fn (User $user) => $user->isSuperAdmin() ? true : null);
    }
}
