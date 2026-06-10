<?php

use Illuminate\Database\Migrations\Migration;

// Superseded: the reporting vs backend split is driven by menu `area` + permissions
// (see add_area_to_menus), not by a role flag. Kept as a no-op to preserve history.
return new class extends Migration
{
    public function up(): void {}

    public function down(): void {}
};
