<?php

namespace App\Filament\Owner\Resources\Dishes\Concerns;

use Illuminate\Support\Facades\DB;

/**
 * El único (plato, ingrediente) de dish_ingredient se comprueba al confirmar
 * (BUG-013): así se pueden intercambiar dos ingredientes entre filas del
 * repetidor. Las páginas del plato lo comprueban antes de terminar de
 * guardar, dentro de writeRespectingConstraints: un repetido de verdad (otra
 * pestaña, por ejemplo) es un aviso en el repetidor y no un error 500 al
 * confirmar la transacción.
 */
trait ChecksDeferredIngredients
{
    protected function checkDeferredIngredients(): void
    {
        $this->writeRespectingConstraints(function (): void {
            DB::statement('SET CONSTRAINTS dish_ingredient_dish_id_ingredient_id_unique IMMEDIATE');
        });
    }

    protected function constraintErrorField(?string $constraint): ?string
    {
        return str_starts_with((string) $constraint, 'dish_ingredient_')
            ? 'data.dishIngredients'
            : parent::constraintErrorField($constraint);
    }
}
