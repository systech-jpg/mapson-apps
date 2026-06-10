<?php

namespace App\Support\Concerns;

use App\Observers\AuditObserver;

trait Auditable
{
    public static function bootAuditable(): void
    {
        static::observe(AuditObserver::class);
    }

    /**
     * Attributes excluded from audit diffs. Models may override/extend.
     *
     * @return array<int, string>
     */
    public function auditExclude(): array
    {
        return array_merge(
            ['created_at', 'updated_at', 'deleted_at', 'remember_token', 'password'],
            $this->auditExcludeExtra ?? [],
        );
    }
}
