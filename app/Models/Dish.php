<?php

namespace App\Models;

use App\Models\Concerns\HasTranslatableFields;
use App\Models\Contracts\BelongsToRestaurant;
use App\Policies\RestaurantContentPolicy;
use Database\Factories\DishFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

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
    use HasFactory, HasTranslatableFields;

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

    /** @return BelongsTo<Restaurant, $this> */
    public function restaurant(): BelongsTo
    {
        return $this->belongsTo(Restaurant::class);
    }

    public function owningRestaurant(): Restaurant
    {
        return $this->restaurant()->firstOrFail();
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
