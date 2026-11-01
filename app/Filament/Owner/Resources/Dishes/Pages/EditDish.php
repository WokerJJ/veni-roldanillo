<?php

namespace App\Filament\Owner\Resources\Dishes\Pages;

use App\Filament\Owner\Resources\Dishes\Concerns\ChecksDeferredIngredients;
use App\Filament\Owner\Resources\Dishes\DishResource;
use App\Filament\Owner\Support\EditOwnerRecord;

/**
 * Editar un plato. Guardar solo los ingredientes también mueve su
 * updated_at (DishIngredient::$touches, AUD-001), así que la versión que se
 * recuerda se lee de la base: el registro en memoria no se enteró. Es la de
 * esta misma transacción, con la fila todavía bloqueada (FOR UPDATE).
 */
class EditDish extends EditOwnerRecord
{
    use ChecksDeferredIngredients;

    protected static string $resource = DishResource::class;

    protected function afterSave(): void
    {
        $this->checkDeferredIngredients();

        $record = $this->getRecord();
        $record->setAttribute('updated_at', $record->newQuery()->whereKey($record->getKey())->value('updated_at'));
        $record->syncOriginalAttribute('updated_at');

        parent::afterSave();
    }
}
