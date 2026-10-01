<?php

namespace App\Models;

use App\Models\Contracts\BelongsToRestaurant;
use App\Policies\RestaurantContentPolicy;
use Database\Factories\DeliveryZoneFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\Pivot;

/**
 * Costo de domicilio de un restaurante a un barrio (pesos enteros). Es un
 * modelo propio y a la vez el pivote de Restaurant::neighborhoods().
 */
#[Fillable(['neighborhood_id', 'fee'])]
#[UsePolicy(RestaurantContentPolicy::class)]
class DeliveryZone extends Pivot implements BelongsToRestaurant
{
    /** @use HasFactory<DeliveryZoneFactory> */
    use HasFactory;

    protected $table = 'delivery_zones';

    public $incrementing = true;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'fee' => 'integer',
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

    /** @return BelongsTo<Neighborhood, $this> */
    public function neighborhood(): BelongsTo
    {
        return $this->belongsTo(Neighborhood::class);
    }
}
