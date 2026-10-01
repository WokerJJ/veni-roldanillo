<?php

namespace App\Models;

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
 */
#[Fillable(['name_es', 'name_en', 'price_delta', 'available', 'position'])]
#[UsePolicy(RestaurantContentPolicy::class)]
class Option extends Model implements BelongsToRestaurant
{
    /** @use HasFactory<OptionFactory> */
    use HasFactory;

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

    /** @return BelongsTo<OptionGroup, $this> */
    public function optionGroup(): BelongsTo
    {
        return $this->belongsTo(OptionGroup::class);
    }

    public function owningRestaurant(): Restaurant
    {
        return $this->optionGroup()->firstOrFail()->owningRestaurant();
    }
}
