<?php

namespace App\Models;

use App\Enums\MediaKind;
use App\Enums\RestaurantStatus;
use App\Models\Concerns\HasMediaImage;
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
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
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
 * guardarlo o borrarlo, solo si está en la carta y su restaurante está
 * publicado. Lo que cambia el restaurante (estado, nombre, categorías) o la
 * sección (nombre) lo reindexa SyncRestaurantDishes.
 *
 * @property Carbon|null $sold_out_until
 */
#[Fillable([
    'menu_section_id', 'name_es', 'name_en', 'description_es', 'description_en',
    'price', 'tags', 'available', 'sold_out_until', 'position',
])]
#[UsePolicy(RestaurantContentPolicy::class)]
class Dish extends Model implements BelongsToRestaurant
{
    /** @use HasFactory<DishFactory> */
    use HasFactory, HasMediaImage, HasTranslatableFields, OwnedByRestaurant, Searchable;

    /** La foto del plato, 1:1 (#113): photo_path guarda su clave, no un archivo. */
    public static function mediaKind(): MediaKind
    {
        return MediaKind::Dish;
    }

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

    /**
     * Los campos que viajan en el documento o deciden si se indexa. Cambiar
     * otro («agotado hoy», el orden, la foto, las etiquetas) no toca el índice.
     */
    private const SEARCH_FIELDS = ['name_es', 'name_en', 'description_es', 'description_en', 'menu_section_id', 'price', 'available'];

    /**
     * Solo los platos en la carta de un restaurante publicado: ni ocultos ni
     * borradores de OSM, ni los que el dueño sacó de la carta.
     */
    public function shouldBeSearchable(): bool
    {
        return $this->available && $this->restaurant !== null && $this->restaurant->status->isPublished();
    }

    /**
     * Al guardarlo, Scout solo encola si es nuevo o cambió algo del índice.
     * wasRecentlyCreated sigue en true en las actualizaciones siguientes del
     * mismo objeto; recién creado, en cambio, todavía no tiene cambios.
     */
    public function searchIndexShouldBeUpdated(): bool
    {
        return ($this->wasRecentlyCreated && $this->getChanges() === [])
            || $this->wasChanged(self::SEARCH_FIELDS);
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
     * scout:import: solo los que van al índice, con sus relaciones.
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    protected function makeAllSearchableUsing(Builder $query): Builder
    {
        return $query->with(self::SEARCH_RELATIONS)->indexable();
    }

    /**
     * Los platos de restaurantes publicados.
     *
     * @param  Builder<self>  $query
     */
    #[Scope]
    protected function ofPublishedRestaurants(Builder $query): void
    {
        $query->whereHas('restaurant', fn (Builder $restaurants) => $restaurants->whereIn('status', RestaurantStatus::published()));
    }

    /**
     * Los que van al índice (lo mismo que shouldBeSearchable, en la base): en
     * la carta y de un restaurante publicado.
     *
     * @param  Builder<self>  $query
     */
    #[Scope]
    protected function indexable(Builder $query): void
    {
        $query->where('available', true)->ofPublishedRestaurants();
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

        if (! $searchable) {
            (new self)->queueRemoveFromSearch($dishes);

            return;
        }

        $indexed = $dishes->filter(fn (self $dish): bool => $dish->shouldBeSearchable());
        $removed = $dishes->diff($indexed);

        if ($indexed->isNotEmpty()) {
            (new self)->queueMakeSearchable($indexed);
        }

        if ($removed->isNotEmpty()) {
            (new self)->queueRemoveFromSearch($removed);
        }
    }

    /**
     * ¿Se puede pedir hoy? En la carta, no «agotado hoy» (ADR 0018) y sin un
     * ingrediente esencial agotado hoy (ADR 0033).
     */
    public function orderableToday(): bool
    {
        return $this->available
            && ($this->sold_out_until === null || $this->sold_out_until->toDateString() < BusinessDay::today()->toDateString())
            && ! $this->lacksEssentialIngredientToday();
    }

    /**
     * Si le falta hoy un ingrediente esencial sin reemplazo (EVA-003, ADR
     * 0033): un esencial agotado con un reemplazo vigente se hace con el
     * reemplazo. Con withEssentialSoldOut() ya viene en la consulta (una sola
     * para todos los platos); si no, pregunta.
     */
    public function lacksEssentialIngredientToday(): bool
    {
        if (array_key_exists('essential_sold_out', $this->getAttributes())) {
            return (bool) $this->getAttribute('essential_sold_out');
        }

        $ingredients = $this->ingredients()->getQuery();
        self::blockingToday($ingredients);

        return $ingredients->exists();
    }

    /**
     * Agrega `essential_sold_out`: si al plato le falta hoy un ingrediente
     * esencial sin reemplazo (lo lee orderableToday sin una consulta por plato).
     *
     * @param  Builder<self>  $query
     */
    #[Scope]
    protected function withEssentialSoldOut(Builder $query): void
    {
        $query->withExists(['ingredients as essential_sold_out' => function (Builder $ingredients): void {
            /** @var Builder<Ingredient> $ingredients */
            self::blockingToday($ingredients);
        }]);
    }

    /**
     * Los ingredientes del plato que hoy lo dejan sin pedir: esenciales,
     * agotados hoy y sin un reemplazo que hoy haya. Es la misma regla que
     * aplica el dispositivo (resources/js/order/ingredients.ts).
     *
     * @param  Builder<Ingredient>  $ingredients
     */
    private static function blockingToday(Builder $ingredients): void
    {
        $today = BusinessDay::today()->toDateString();

        $ingredients
            ->where('dish_ingredient.essential', true)
            ->where('ingredients.sold_out_until', '>=', $today)
            ->whereDoesntHave('substitute', function (Builder $substitute) use ($today): void {
                $substitute->where(fn (Builder $available) => $available->whereNull('sold_out_until')->orWhere('sold_out_until', '<', $today));
            });
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

    /**
     * Los ingredientes que lleva (#112, ADR 0033), con `essential` en el pivote.
     *
     * @return BelongsToMany<Ingredient, $this>
     */
    public function ingredients(): BelongsToMany
    {
        return $this->belongsToMany(Ingredient::class, 'dish_ingredient')->withPivot('essential');
    }

    /**
     * Las mismas filas como modelos propios: el repetidor del panel las edita.
     *
     * @return HasMany<DishIngredient, $this>
     */
    public function dishIngredients(): HasMany
    {
        return $this->hasMany(DishIngredient::class)->orderBy('id');
    }

    /** @return HasMany<OptionGroup, $this> */
    public function optionGroups(): HasMany
    {
        return $this->hasMany(OptionGroup::class)->orderBy('position')->orderBy('id');
    }
}
