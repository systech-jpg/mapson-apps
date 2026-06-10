<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role_id',
        'is_active',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Cached per-request permission map keyed by menu key.
     *
     * @var array<string, array<string, bool>>|null
     */
    protected ?array $permissionMap = null;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function employee(): HasOne
    {
        return $this->hasOne(Employee::class);
    }

    public function isSuperAdmin(): bool
    {
        return (bool) $this->role?->is_super;
    }

    /**
     * Build (and memoize) the permission map from the user's role menus.
     *
     * @return array<string, array<string, bool>>
     */
    public function permissionMap(): array
    {
        if ($this->permissionMap !== null) {
            return $this->permissionMap;
        }

        $map = [];

        $this->loadMissing('role.menus');

        foreach ($this->role?->menus ?? [] as $menu) {
            $map[$menu->key] = [
                'view' => (bool) $menu->pivot->can_view,
                'create' => (bool) $menu->pivot->can_create,
                'edit' => (bool) $menu->pivot->can_edit,
                'delete' => (bool) $menu->pivot->can_delete,
            ];
        }

        return $this->permissionMap = $map;
    }

    public function hasMenuAccess(string $key, string $action = 'view'): bool
    {
        if ($this->isSuperAdmin()) {
            return true;
        }

        return (bool) ($this->permissionMap()[$key][$action] ?? false);
    }
}
