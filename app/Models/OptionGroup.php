<?php

namespace App\Models;

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
 * Grupo de opciones de un plato: obligatorio (p. ej. proteína, min 1 / max 1)
 * o de adiciones opcionales con recargo.
 */
#[Fillable(['name_es', 'name_en', 'required', 'min_choices', 'max_choices', 'position'])]
#[UsePolicy(RestaurantContentPolicy::class)]
class OptionGroup extends Model implements BelongsToRestaurant
{
    /** @use HasFactory<OptionGroupFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'required' => 'boolean',
            'min_choices' => 'integer',
            'max_choices' => 'integer',
            'position' => 'integer',
        ];
    }

    /** @return BelongsTo<Dish, $this> */
    public function dish(): BelongsTo
    {
        return $this->belongsTo(Dish::class);
    }

    public function owningRestaurant(): Restaurant
    {
        return $this->dish()->firstOrFail()->owningRestaurant();
    }

    /** @return HasMany<Option, $this> */
    public function options(): HasMany
    {
        return $this->hasMany(Option::class)->orderBy('position')->orderBy('id');
    }
}
