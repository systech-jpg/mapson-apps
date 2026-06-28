<?php

namespace App\Providers;

use App\Models\ErpSetting;
use App\Models\User;
use App\Repositories\Contracts\HolidayRepositoryInterface;
use App\Repositories\Eloquent\EloquentHolidayRepository;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Throwable;

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

        // If an active ERP setting exists, override the .env-based 'erp' connection
        // at runtime. Falls back silently to .env when the table/row is absent.
        try {
            $erp = ErpSetting::query()->where('is_active', true)->first();
            if ($erp && filled($erp->host)) {
                $erp->applyToConfig();
            }
        } catch (Throwable) {
            // table not migrated yet / DB unavailable → keep .env defaults
        }
    }
}
