<?php

namespace App\Filament\Admin\Resources\Restaurants\Pages;

use App\Filament\Admin\Resources\Restaurants\RestaurantResource;
use App\Filament\Concerns\DetectsConcurrentEdits;
use App\Filament\Owner\Concerns\TranslatesConstraintViolations;
use App\Jobs\SyncRestaurantDishes;
use App\Models\Restaurant;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Database\Eloquent\Model;

/**
 * Editar una ficha desde administración. Si el dueño (u otra pestaña) la
 * guardó después de abrirla, no se pisa (DetectsConcurrentEdits). Editar
 * desde aquí no mueve «Actualizada por el restaurante»: no lo hizo él.
 */
class EditRestaurant extends EditRecord
{
    use DetectsConcurrentEdits, TranslatesConstraintViolations;

    protected static string $resource = RestaurantResource::class;

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function mutateFormDataBeforeFill(array $data): array
    {
        return RestaurantResource::fillFormData($this->restaurant(), $data);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function handleRecordUpdate(Model $record, array $data): Model
    {
        return $this->writeRespectingConstraints(fn (): Model => RestaurantResource::persist($this->restaurant(), $data));
    }

    protected function beforeSave(): void
    {
        $this->guardAgainstConcurrentEdit();
    }

    /**
     * Las categorías van en cada plato del índice de búsqueda (ADR 0029) y
     * Filament las guarda aparte de la ficha: se reindexan sus platos al
     * confirmar el guardado (la cola espera a la transacción).
     */
    protected function afterSave(): void
    {
        $this->rememberVersion($this->getRecord());
        SyncRestaurantDishes::dispatch($this->restaurant()->id);
    }

    protected function versionedRecord(): Model
    {
        return $this->getRecord();
    }

    protected function constraintErrorField(?string $constraint): ?string
    {
        return match ($constraint) {
            'restaurants_slug_format', 'restaurants_slug_unique' => 'data.slug',
            default => null,
        };
    }

    private function restaurant(): Restaurant
    {
        $record = $this->getRecord();
        abort_unless($record instanceof Restaurant, 404);

        return $record;
    }
}
