<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Intercambiar dos ingredientes entre filas del plato (BUG-013, AUD-002):
 * el repetidor guarda fila por fila y, a mitad de camino, las dos filas
 * tienen el mismo ingrediente. El único (plato, ingrediente) se comprueba al
 * confirmar la transacción (DEFERRABLE INITIALLY DEFERRED), cuando ya
 * quedaron intercambiados. Las páginas del plato lo vuelven a comprobar
 * antes de terminar de guardar (SET CONSTRAINTS … IMMEDIATE) para que un
 * repetido de verdad sea un aviso y no un error al confirmar.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE dish_ingredient
            DROP CONSTRAINT dish_ingredient_dish_id_ingredient_id_unique,
            ADD CONSTRAINT dish_ingredient_dish_id_ingredient_id_unique UNIQUE (dish_id, ingredient_id) DEFERRABLE INITIALLY DEFERRED');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE dish_ingredient
            DROP CONSTRAINT dish_ingredient_dish_id_ingredient_id_unique,
            ADD CONSTRAINT dish_ingredient_dish_id_ingredient_id_unique UNIQUE (dish_id, ingredient_id)');
    }
};
