<?php

namespace App\Filament\Owner\Concerns;

use App\Models\Dish;
use App\Models\Ingredient;
use App\Models\Restaurant;
use Filament\Notifications\Notification;
use Illuminate\Support\Facades\Gate;

/**
 * «Agotado hoy» y «Ya hay» de un toque en Hoy y Mi carta (#114, ADR 0035).
 *
 * El navegador manda el id y el valor al que se quiere llegar, nunca «cambiá
 * lo que haya» (BUG-014): tocar «Ya hay» en una pantalla vieja deja el plato
 * disponible aunque ya lo estuviera. El id se busca solo entre los del
 * restaurante de la dirección (otro id da 404) y el registro se autoriza con
 * RestaurantContentPolicy::update.
 *
 * Son métodos públicos de Livewire: los argumentos llegan del navegador tal
 * cual. Un id que no es un entero o un valor que no es true/false da 404,
 * no un TypeError (500).
 */
trait SetsSoldOutToday
{
    /** El restaurante de la dirección, ya autorizado. */
    abstract protected function restaurant(): Restaurant;

    public function setDishSoldOut(mixed $dish, mixed $soldOut): void
    {
        $record = $this->restaurant()->dishes()->whereKey(self::requestedId($dish))->firstOrFail();

        $this->markSoldOutToday($record, self::requestedFlag($soldOut));
    }

    public function setIngredientSoldOut(mixed $ingredient, mixed $soldOut): void
    {
        $record = $this->restaurant()->ingredients()->whereKey(self::requestedId($ingredient))->firstOrFail();

        $this->markSoldOutToday($record, self::requestedFlag($soldOut));
    }

    /** Un solo lugar para los dos: escribe, mueve «Actualizada el…» una vez y avisa. */
    private function markSoldOutToday(Dish|Ingredient $record, bool $soldOut): void
    {
        Gate::authorize('update', $record);

        $record->setSoldOutToday($soldOut);
        $this->restaurant()->touchOwnerUpdate();

        Notification::make()
            ->success()
            ->title(__($soldOut ? 'panel.today.marked_sold_out' : 'panel.today.marked_back', ['name' => $record->name_es]))
            ->send();
    }

    private static function requestedId(mixed $value): int
    {
        abort_unless(is_int($value) || (is_string($value) && ctype_digit($value)), 404);

        return (int) $value;
    }

    private static function requestedFlag(mixed $value): bool
    {
        abort_unless(is_bool($value), 404);

        return $value;
    }
}
