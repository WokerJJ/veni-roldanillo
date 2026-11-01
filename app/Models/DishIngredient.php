<?php

namespace App\Models;

use App\Models\Concerns\OwnedByRestaurant;
use App\Models\Contracts\BelongsToRestaurant;
use App\Policies\RestaurantContentPolicy;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Un ingrediente que lleva un plato (#112, ADR 0033), esencial o no.
 *
 * Es la fila de dish_ingredient con su propio id: así el formulario del plato
 * la edita como un repetidor. restaurant_id no es asignable: lo copia del
 * plato al crearla, y las dos FK compuestas (plato e ingrediente con el mismo
 * restaurant_id) rechazan un ingrediente de otro restaurante en la base.
 */
#[Fillable(['ingredient_id', 'essential'])]
#[UsePolicy(RestaurantContentPolicy::class)]
class DishIngredient extends Model implements BelongsToRestaurant
{
    use OwnedByRestaurant;

    protected $table = 'dish_ingredient';

    /**
     * Cambiar los ingredientes de un plato es cambiar el plato: mueve su
     * updated_at, que es la versión que mira el control optimista del panel
     * (AUD-001, DetectsConcurrentEdits).
     *
     * @var list<string>
     */
    protected $touches = ['dish'];

    /** @var array<string, mixed> */
    protected $attributes = [
        'essential' => false,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'essential' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $link): void {
            if ($link->getAttribute('restaurant_id') === null) {
                $link->setAttribute('restaurant_id', Dish::query()->whereKey($link->dish_id)->value('restaurant_id'));
            }
        });
    }

    /** @return BelongsTo<Restaurant, $this> */
    public function restaurant(): BelongsTo
    {
        return $this->belongsTo(Restaurant::class);
    }

    /** @return BelongsTo<Dish, $this> */
    public function dish(): BelongsTo
    {
        return $this->belongsTo(Dish::class);
    }

    /** @return BelongsTo<Ingredient, $this> */
    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class);
    }
}
