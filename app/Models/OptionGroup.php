<?php

namespace App\Models;

use App\Enums\OptionGroupKind;
use App\Models\Concerns\HasTranslatableFields;
use App\Models\Contracts\BelongsToRestaurant;
use App\Policies\RestaurantContentPolicy;
use Database\Factories\OptionGroupFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Grupo de opciones de un plato: obligatorio (p. ej. proteína, min 1 / max 1),
 * de adiciones opcionales con recargo o, con `kind` Removal, de ingredientes
 * que se pueden quitar (ADR 0023).
 *
 * Larastan lee la columna `kind` de la migración como texto y no conoce el
 * cast: el @property fija el tipo del enum PHP (como en Restaurant).
 *
 * @property OptionGroupKind $kind
 */
#[Fillable(['kind', 'name_es', 'name_en', 'required', 'min_choices', 'max_choices', 'position'])]
#[UsePolicy(RestaurantContentPolicy::class)]
class OptionGroup extends Model implements BelongsToRestaurant
{
    /** @use HasFactory<OptionGroupFactory> */
    use HasFactory, HasTranslatableFields;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'kind' => OptionGroupKind::class,
            'required' => 'boolean',
            'min_choices' => 'integer',
            'max_choices' => 'integer',
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

    /** @return BelongsTo<Dish, $this> */
    public function dish(): BelongsTo
    {
        return $this->belongsTo(Dish::class);
    }

    public function owningRestaurant(): Restaurant
    {
        // El plato ya cargado, solo si es el de la FK guardada (OwnedByRestaurant).
        $dish = $this->relationLoaded('dish') ? $this->getRelation('dish') : null;

        if ($dish instanceof Dish && $dish->exists && $dish->getKey() === $this->getOriginal('dish_id')) {
            return $dish->owningRestaurant();
        }

        return $this->dish()->firstOrFail()->owningRestaurant();
    }

    /** @return HasMany<Option, $this> */
    public function options(): HasMany
    {
        return $this->hasMany(Option::class)->orderBy('position')->orderBy('id');
    }
}
