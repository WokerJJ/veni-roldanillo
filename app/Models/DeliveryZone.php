<?php

namespace App\Models;

use Database\Factories\DeliveryZoneFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\Pivot;

/**
 * Costo de domicilio de un restaurante a un barrio (pesos enteros). Es un
 * modelo propio y a la vez el pivote de Restaurant::neighborhoods().
 */
#[Fillable(['neighborhood_id', 'fee'])]
class DeliveryZone extends Pivot
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

    /** @return BelongsTo<Neighborhood, $this> */
    public function neighborhood(): BelongsTo
    {
        return $this->belongsTo(Neighborhood::class);
    }
}
