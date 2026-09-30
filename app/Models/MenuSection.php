<?php

namespace App\Models;

use App\Models\Contracts\BelongsToRestaurant;
use App\Policies\RestaurantContentPolicy;
use Database\Factories\MenuSectionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name_es', 'name_en', 'position'])]
#[UsePolicy(RestaurantContentPolicy::class)]
class MenuSection extends Model implements BelongsToRestaurant
{
    /** @use HasFactory<MenuSectionFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'position' => 'integer',
        ];
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

    /**
     * Desempate por id: con la misma posición el orden sería el que
     * PostgreSQL quiera y el menú cambiaría entre cargas.
     *
     * @return HasMany<Dish, $this>
     */
    public function dishes(): HasMany
    {
        return $this->hasMany(Dish::class)->orderBy('position')->orderBy('id');
    }
}
