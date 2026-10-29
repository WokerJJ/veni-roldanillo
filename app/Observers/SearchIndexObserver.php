<?php

namespace App\Observers;

use App\Jobs\SyncRestaurantDishes;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Restaurant;
use Illuminate\Database\Eloquent\Collection;

/**
 * Lo que cambia los platos del índice de búsqueda sin tocar un plato (#17,
 * ADR 0029). Los cambios del plato mismo (crear, editar, agotar, borrar) los
 * sigue Scout por su cuenta (Dish usa Searchable).
 *
 * - Restaurante: su estado (publicar, ocultar, retiro), su nombre o su slug.
 *   Las categorías no disparan eventos: las reindexa
 *   Restaurant::syncCategories.
 * - Restaurante borrado: la base borra sus platos en cascada, sin eventos,
 *   así que se sacan del índice antes.
 * - Sección renombrada: su nombre va en cada plato.
 */
class SearchIndexObserver
{
    /** Los campos de la ficha que viajan en el índice o deciden si se indexa. */
    public const RESTAURANT_FIELDS = ['status', 'name', 'slug'];

    public function saved(Restaurant|MenuSection $model): void
    {
        // Al crearlo no hay cambios (wasChanged mira las actualizaciones), y
        // un restaurante o una sección recién creados no tienen platos.
        $fields = $model instanceof Restaurant ? self::RESTAURANT_FIELDS : ['name_es', 'name_en'];

        if ($model->wasChanged($fields)) {
            SyncRestaurantDishes::dispatch($model instanceof Restaurant ? $model->id : $model->restaurant_id);
        }
    }

    public function deleting(Restaurant|MenuSection $model): void
    {
        if ($model instanceof Restaurant) {
            Dish::query()
                ->where('restaurant_id', $model->id)
                ->chunkById(500, fn (Collection $dishes) => Dish::syncWithSearch($dishes, false));
        }
    }
}
