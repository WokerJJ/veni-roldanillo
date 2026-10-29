<?php

namespace App\Models;

use App\Enums\RestaurantStatus;
use App\Models\Concerns\HasTranslatableFields;
use App\Models\Concerns\OwnedByRestaurant;
use App\Models\Contracts\BelongsToRestaurant;
use App\Policies\RestaurantContentPolicy;
use App\Support\BusinessDay;
use Database\Factories\DishFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Laravel\Scout\Searchable;

/**
 * Plato con precio en pesos enteros.
 *
 * restaurant_id no es asignable: un plato se crea siempre desde la relación
 * del restaurante autorizado, nunca con un restaurant_id del cliente:
 *
 *     $restaurant->dishes()->create(['menu_section_id' => $id, ...]);
 *
 * Si menu_section_id es de otro restaurante, la FK compuesta
 * (menu_section_id, restaurant_id) lo rechaza en la base.
 *
 * tags es una lista libre de etiquetas del dueño («picante», «vegetariano»):
 * todavía no hay un catálogo acordado y cerrarlo ahora obligaría a una
 * migración por cada etiqueta nueva; se normalizará cuando existan filtros.
 *
 * sold_out_until es «agotado hoy»: el plato sigue en el menú, pero no hay
 * hasta esa fecha, incluida. Larastan tipa la columna date de la migración
 * como texto e ignora el cast; el @property fija el tipo.
 *
 * Búsqueda por plato (#17, ADR 0029): Scout lo indexa en Meilisearch al
 * guardarlo o borrarlo, solo si su restaurante está publicado. Lo que cambia
 * el restaurante (estado, nombre, categorías) o la sección (nombre) lo
 * reindexa SyncRestaurantDishes.
 *
 * @property Carbon|null $sold_out_until
 */
#[Fillable([
    'menu_section_id', 'name_es', 'name_en', 'description_es', 'description_en',
    'price', 'photo_path', 'tags', 'available', 'sold_out_until', 'position',
])]
#[UsePolicy(RestaurantContentPolicy::class)]
class Dish extends Model implements BelongsToRestaurant
{
    /** @use HasFactory<DishFactory> */
    use HasFactory, HasTranslatableFields, OwnedByRestaurant, Searchable;

    /** @var array<string, mixed> */
    protected $attributes = [
        'tags' => '[]',
        'available' => true,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'price' => 'integer',
            'tags' => 'array',
            'available' => 'boolean',
            'sold_out_until' => 'date',
            'position' => 'integer',
        ];
    }

    /**
     * Campos con columnas _es y _en (ver HasTranslatableFields).
     *
     * @return list<string>
     */
    public function translatableFields(): array
    {
        return ['name', 'description'];
    }

    /**
     * Lo que carga cada documento del índice, en una consulta por relación.
     * Del restaurante y la sección, enteros: quedan cargados en el plato que
     * se guardó, y otro código puede leerlos después.
     */
    public const SEARCH_RELATIONS = ['restaurant', 'restaurant.categories:categories.id,categories.slug,categories.name_es,categories.name_en', 'menuSection'];

    /** El índice de Meilisearch, con el prefijo de SCOUT_PREFIX si hay. */
    public function searchableAs(): string
    {
        $prefix = config('scout.prefix');

        return (is_string($prefix) ? $prefix : '').'dishes';
    }

    /** Solo los platos de un restaurante publicado: ni ocultos ni borradores de OSM. */
    public function shouldBeSearchable(): bool
    {
        return $this->restaurant !== null && $this->restaurant->status->isPublished();
    }

    /**
     * El documento del índice: lo que cualquiera ve en la ficha y nada del
     * dueño. `available` es la columna («lo tengo en la carta»); «agotado hoy»
     * vence solo a la medianoche, así que se mira al responder, en la base.
     *
     * @return array<string, mixed>
     */
    public function toSearchableArray(): array
    {
        $restaurant = $this->restaurant;
        /** @var Collection<int, Category> $categories */
        $categories = $restaurant === null ? new Collection : $restaurant->categories;

        return [
            'id' => $this->id,
            'name_es' => $this->name_es,
            'name_en' => $this->name_en,
            'description_es' => $this->description_es,
            'description_en' => $this->description_en,
            'section_es' => $this->menuSection?->name_es,
            'section_en' => $this->menuSection?->name_en,
            'price' => $this->price,
            'available' => $this->available,
            'restaurant_slug' => $restaurant?->slug,
            'restaurant_name' => $restaurant?->name,
            'category_slugs' => $categories->pluck('slug')->values()->all(),
            'categories' => $categories->flatMap(fn (Category $category): array => array_values(array_filter([$category->name_es, $category->name_en])))->values()->all(),
        ];
    }

    /**
     * Antes de armar los documentos (al guardar uno, en la cola o con
     * scout:import), las relaciones de todos juntos.
     *
     * @param  Collection<int, self>  $models
     * @return Collection<int, self>
     */
    public function makeSearchableUsing(Collection $models): Collection
    {
        return $models->loadMissing(self::SEARCH_RELATIONS);
    }

    /**
     * scout:import: solo los de restaurantes publicados, con sus relaciones.
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    protected function makeAllSearchableUsing(Builder $query): Builder
    {
        return $query->with(self::SEARCH_RELATIONS)->ofPublishedRestaurants();
    }

    /**
     * Los platos de restaurantes publicados: los que van al índice.
     *
     * @param  Builder<self>  $query
     */
    #[Scope]
    protected function ofPublishedRestaurants(Builder $query): void
    {
        $query->whereHas('restaurant', fn (Builder $restaurants) => $restaurants->whereIn('status', RestaurantStatus::published()));
    }

    /**
     * Sube al índice los que tienen que estar y saca los demás, sin la cola
     * si scout.queue está apagado. Para recorrer muchos con chunkById.
     *
     * @param  Collection<int, self>  $dishes
     */
    public static function syncWithSearch(Collection $dishes, bool $searchable): void
    {
        if ($dishes->isEmpty()) {
            return;
        }

        $searchable
            ? (new self)->queueMakeSearchable($dishes->filter(fn (self $dish): bool => $dish->shouldBeSearchable()))
            : (new self)->queueRemoveFromSearch($dishes);
    }

    /** ¿Se puede pedir hoy? En la carta y no «agotado hoy» (ADR 0018). */
    public function orderableToday(): bool
    {
        return $this->available
            && ($this->sold_out_until === null || $this->sold_out_until->toDateString() < BusinessDay::today()->toDateString());
    }

    /** @return BelongsTo<Restaurant, $this> */
    public function restaurant(): BelongsTo
    {
        return $this->belongsTo(Restaurant::class);
    }

    /** @return BelongsTo<MenuSection, $this> */
    public function menuSection(): BelongsTo
    {
        return $this->belongsTo(MenuSection::class);
    }

    /** @return HasMany<OptionGroup, $this> */
    public function optionGroups(): HasMany
    {
        return $this->hasMany(OptionGroup::class)->orderBy('position')->orderBy('id');
    }
}
