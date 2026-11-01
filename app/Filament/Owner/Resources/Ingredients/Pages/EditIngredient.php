<?php

namespace App\Filament\Owner\Resources\Ingredients\Pages;

use App\Filament\Owner\Resources\Ingredients\IngredientResource;
use App\Filament\Owner\Support\EditOwnerRecord;
use App\Models\Ingredient;
use Filament\Actions\Action;
use Filament\Actions\DeleteAction;

/**
 * Editar un ingrediente. Borrarlo avisa antes en cuántos platos y opciones
 * está (IngredientResource::usage): la base lo quita de esos platos y deja
 * las opciones sin ingrediente.
 */
class EditIngredient extends EditOwnerRecord
{
    protected static string $resource = IngredientResource::class;

    protected function getHeaderActions(): array
    {
        return array_map(
            fn (Action $action): Action => $action instanceof DeleteAction
                ? $action->modalDescription(fn (Ingredient $record): string => IngredientResource::usage($record))
                : $action,
            array_filter(parent::getHeaderActions(), fn (mixed $action): bool => $action instanceof Action),
        );
    }

    protected function constraintErrorField(?string $constraint): ?string
    {
        return IngredientResource::fieldForConstraint($constraint);
    }
}
