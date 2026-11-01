<?php

namespace App\Models;

use App\Models\Concerns\HasTranslatableFields;
use App\Models\Concerns\OwnedByRestaurant;
use App\Models\Contracts\BelongsToRestaurant;
use App\Policies\RestaurantContentPolicy;
use App\Support\BusinessDay;
use Database\Factories\IngredientFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Un ingrediente de la lista común del restaurante (#112, ADR 0033): lo
 * llevan sus platos (DishIngredient, esencial o no) y lo pueden nombrar las
 * opciones de quitar y las adiciones (Option::ingredient).
 *
 * sold_out_until es «agotado hoy», como en Dish: no hay hasta esa fecha,
 * incluida, y a la medianoche de Colombia vuelve solo. El reemplazo es otro
 * ingrediente del mismo restaurante (la FK compuesta lo exige) con su
 * recargo en pesos enteros.
 *
 * restaurant_id no es asignable: se crea desde la relación del restaurante
 * autorizado ($restaurant->ingredients()->create([...])).
 *
 * @property Carbon|null $sold_out_until
 */
#[Fillable(['name_es', 'name_en', 'sold_out_until', 'substitute_ingredient_id', 'substitute_price_delta'])]
#[UsePolicy(RestaurantContentPolicy::class)]
class Ingredient extends Model implements BelongsToRestaurant
{
    /** @use HasFactory<IngredientFactory> */
    use HasFactory, HasTranslatableFields, OwnedByRestaurant;

    /** @var array<string, mixed> */
    protected $attributes = [
        'substitute_price_delta' => 0,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'sold_out_until' => 'date',
            'substitute_price_delta' => 'integer',
        ];
    }

    /**
     * Campos con columnas _es y _en (ver HasTranslatableFields).
     *
     * @return list<string>
     */
    public function translatableFields(): array
    {
        return ['name'];
    }

    /** «Agotado hoy» en el día de Colombia. */
    public function isSoldOutToday(): bool
    {
        return $this->sold_out_until !== null
            && $this->sold_out_until->toDateString() >= BusinessDay::today()->toDateString();
    }

    /** Marca o quita «agotado hoy»: vence solo a la medianoche. */
    public function setSoldOutToday(bool $soldOut): void
    {
        $this->forceFill(['sold_out_until' => $soldOut ? BusinessDay::today()->toDateString() : null])->save();
    }

    /** @return BelongsTo<Restaurant, $this> */
    public function restaurant(): BelongsTo
    {
        return $this->belongsTo(Restaurant::class);
    }

    /** @return BelongsTo<self, $this> */
    public function substitute(): BelongsTo
    {
        return $this->belongsTo(self::class, 'substitute_ingredient_id');
    }

    /** @return BelongsToMany<Dish, $this> */
    public function dishes(): BelongsToMany
    {
        return $this->belongsToMany(Dish::class, 'dish_ingredient')->withPivot('essential');
    }

    /** @return HasMany<DishIngredient, $this> */
    public function dishLinks(): HasMany
    {
        return $this->hasMany(DishIngredient::class);
    }

    /** @return HasMany<Option, $this> */
    public function options(): HasMany
    {
        return $this->hasMany(Option::class);
    }
}
