<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        Role::updateOrCreate(
            ['slug' => 'super-admin'],
            [
                'name' => 'Super Admin',
                'description' => 'Akses penuh ke seluruh sistem.',
                'is_super' => true,
                'is_locked' => true,
                'is_active' => true,
            ],
        );

        Role::updateOrCreate(
            ['slug' => 'staff'],
            [
                'name' => 'Staff',
                'description' => 'Role contoh dengan akses terbatas.',
                'is_super' => false,
                'is_locked' => false,
                'is_active' => true,
            ],
        );

        Role::updateOrCreate(
            ['slug' => 'reporting'],
            [
                'name' => 'Reporting',
                'description' => 'Akses area reporting (Dashboard & Analisa) untuk direksi.',
                'is_super' => false,
                'is_locked' => false,
                'is_active' => true,
            ],
        );
    }
}
