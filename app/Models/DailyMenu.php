<?php

namespace App\Models;

use App\Models\Concerns\HasTranslatableFields;
use App\Models\Contracts\BelongsToRestaurant;
use App\Policies\RestaurantContentPolicy;
use Database\Factories\DailyMenuFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Menú del día («Almuerzos de hoy»).
 */
#[Fillable(['served_on', 'description_es', 'description_en', 'price'])]
#[UsePolicy(RestaurantContentPolicy::class)]
class DailyMenu extends Model implements BelongsToRestaurant
{
    /** @use HasFactory<DailyMenuFactory> */
    use HasFactory, HasTranslatableFields;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'served_on' => 'date',
            'price' => 'integer',
        ];
    }

    /**
     * Campos con columnas _es y _en (ver HasTranslatableFields).
     *
     * @return list<string>
     */
    public function translatableFields(): array
    {
        return ['description'];
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
}
