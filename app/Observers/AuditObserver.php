<?php

namespace App\Observers;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

class AuditObserver
{
    public function created(Model $model): void
    {
        $this->record($model, 'created', null, $this->clean($model, $model->getAttributes()));
    }

    public function updated(Model $model): void
    {
        $changes = $this->clean($model, $model->getChanges());

        if (empty($changes)) {
            return;
        }

        $old = array_intersect_key($model->getOriginal(), $changes);

        $this->record($model, 'updated', $old, $changes);
    }

    public function deleted(Model $model): void
    {
        // Soft delete shows up here; treat the deleted_at change as a delete event.
        $this->record($model, 'deleted', null, null);
    }

    public function restored(Model $model): void
    {
        $this->record($model, 'restored', null, null);
    }

    /**
     * @param  array<string, mixed>|null  $old
     * @param  array<string, mixed>|null  $new
     */
    protected function record(Model $model, string $event, ?array $old, ?array $new): void
    {
        AuditLog::create([
            'auditable_type' => $model->getMorphClass(),
            'auditable_id' => $model->getKey(),
            'event' => $event,
            'old_values' => $old ?: null,
            'new_values' => $new ?: null,
            'user_id' => Auth::id(),
            'ip_address' => $this->safe(fn () => Request::ip()),
            'user_agent' => $this->safe(fn () => Request::userAgent()),
        ]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    protected function clean(Model $model, array $attributes): array
    {
        $exclude = method_exists($model, 'auditExclude') ? $model->auditExclude() : ['created_at', 'updated_at'];

        return array_diff_key($attributes, array_flip($exclude));
    }

    protected function safe(callable $fn): ?string
    {
        try {
            return $fn();
        } catch (\Throwable) {
            return null;
        }
    }
}
