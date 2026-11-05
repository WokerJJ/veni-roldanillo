<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * El orden de los ingredientes de un plato (AUD-026, #115): los chips de la
 * carta salen en el orden que el dueño les dio en el panel, y arrastrar una
 * fila del repetidor lo cambia. Hasta ahora el orden era el id, así que
 * reordenar no se guardaba. Las filas que ya hay quedan en el orden en que
 * se cargaron (por id dentro de cada plato), que es lo que se veía.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dish_ingredient', function (Blueprint $table): void {
            $table->smallInteger('position')->default(0);
        });

        DB::statement('UPDATE dish_ingredient
            SET position = ordered.position
            FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY dish_id ORDER BY id) - 1 AS position
                FROM dish_ingredient
            ) AS ordered
            WHERE dish_ingredient.id = ordered.id');
    }

    public function down(): void
    {
        Schema::table('dish_ingredient', function (Blueprint $table): void {
            $table->dropColumn('position');
        });
    }
};
