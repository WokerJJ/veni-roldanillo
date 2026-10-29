<?php

namespace App\Jobs;

use App\Models\Dish;
use App\Models\Restaurant;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Pone al día en el índice de búsqueda (#17, ADR 0029) los platos de un
 * restaurante, después de un cambio que no es del plato: se publicó, se
 * ocultó o se retiró, cambió de nombre, de slug o de categorías, o se
 * renombró una de sus secciones.
 *
 * Lee la base cuando corre, no lo que había al despacharlo: va por la cola y
 * después de confirmar la transacción del panel (afterCommit), así las
 * categorías que Filament guarda después de la ficha ya están. Correrlo dos
 * veces deja lo mismo.
 */
class SyncRestaurantDishes implements ShouldQueue
{
    use Queueable;

    /**
     * Segundos de espera antes de cada reintento (el worker hace tres): si
     * Meilisearch se reinicia, no se gastan todos en el mismo segundo. Los
     * usan también los trabajos de Scout (App\Jobs\Search).
     */
    public const BACKOFF = [10, 60, 300];

    /** @var list<int> */
    public $backoff = self::BACKOFF;

    public function __construct(public readonly int $restaurantId)
    {
        $this->afterCommit();
    }

    public function handle(): void
    {
        $restaurant = Restaurant::query()->select(['id', 'status'])->find($this->restaurantId);

        if ($restaurant === null) {
            return;
        }

        $published = $restaurant->status->isPublished();

        Dish::query()
            ->where('restaurant_id', $restaurant->id)
            ->with(Dish::SEARCH_RELATIONS)
            ->chunkById(500, fn (Collection $dishes) => Dish::syncWithSearch($dishes, $published));
    }
}
