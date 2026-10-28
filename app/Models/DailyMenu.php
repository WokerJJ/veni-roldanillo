<?php

namespace App\Models;

use App\Models\Concerns\HasTranslatableFields;
use App\Models\Concerns\OwnedByRestaurant;
use App\Models\Contracts\BelongsToRestaurant;
use App\Policies\RestaurantContentPolicy;
use Database\Factories\DailyMenuFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Menú del día («Almuerzos de hoy»).
 *
 * Larastan tipa la columna date de la migración como texto e ignora el cast;
 * el @property fija el tipo (como en SpecialHour).
 *
 * @property Carbon $served_on
 */
#[Fillable(['served_on', 'description_es', 'description_en', 'price'])]
#[UsePolicy(RestaurantContentPolicy::class)]
class DailyMenu extends Model implements BelongsToRestaurant
{
    /** @use HasFactory<DailyMenuFactory> */
    use HasFactory, HasTranslatableFields, OwnedByRestaurant;

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
}
