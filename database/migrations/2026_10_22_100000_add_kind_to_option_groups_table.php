<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * «Quitar ingredientes» como un tipo de grupo de opciones (#14, ADR 0023).
 *
 * Una columna con valor por defecto: los grupos que ya existen quedan como
 * «elegir» (lo que eran), y en PostgreSQL agregarla no reescribe la tabla.
 * Un grupo de quitar nunca es obligatorio: lo fija la restricción.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('option_groups', function (Blueprint $table) {
            $table->string('kind', 16)->default('choice')->after('dish_id');
        });

        DB::statement("ALTER TABLE option_groups ADD CONSTRAINT option_groups_kind_valid CHECK (
            kind IN ('choice', 'removal')
            AND (kind = 'choice' OR (min_choices = 0 AND required = false))
        )");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE option_groups DROP CONSTRAINT option_groups_kind_valid');

        Schema::table('option_groups', function (Blueprint $table) {
            $table->dropColumn('kind');
        });
    }
};
