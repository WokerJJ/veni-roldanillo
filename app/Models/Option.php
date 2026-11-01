<?php

namespace App\Models;

use App\Models\Concerns\HasTranslatableFields;
use App\Models\Contracts\BelongsToRestaurant;
use App\Policies\RestaurantContentPolicy;
use Database\Factories\OptionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Opción o adición; price_delta es el recargo en pesos enteros (0 si no suma).
 *
 * ingredient_id (#112, ADR 0033): si la opción es un ingrediente de la lista
 * del restaurante (un «Quitar tomate» o una adición de aguacate), su «agotado
 * hoy» la afecta. Un disparador de la base exige que sea del mismo
 * restaurante que el plato.
 */
#[Fillable(['name_es', 'name_en', 'price_delta', 'available', 'position', 'ingredient_id'])]
#[UsePolicy(RestaurantContentPolicy::class)]
class Option extends Model implements BelongsToRestaurant
{
    /** @use HasFactory<OptionFactory> */
    use HasFactory, HasTranslatableFields;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'price_delta' => 'integer',
            'available' => 'boolean',
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
        return ['name'];
    }

    /** @return BelongsTo<OptionGroup, $this> */
    public function optionGroup(): BelongsTo
    {
        return $this->belongsTo(OptionGroup::class);
    }

    /** @return BelongsTo<Ingredient, $this> */
    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class);
    }

    public function owningRestaurant(): Restaurant
    {
        // El grupo ya cargado, solo si es el de la FK guardada (OwnedByRestaurant).
        $group = $this->relationLoaded('optionGroup') ? $this->getRelation('optionGroup') : null;

        if ($group instanceof OptionGroup && $group->exists && $group->getKey() === $this->getOriginal('option_group_id')) {
            return $group->owningRestaurant();
        }

        return $this->optionGroup()->firstOrFail()->owningRestaurant();
    }
}
