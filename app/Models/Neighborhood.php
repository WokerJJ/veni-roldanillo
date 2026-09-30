<?php

namespace App\Models;

use Database\Factories\NeighborhoodFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Barrio de Roldanillo. El contorno (area) queda para cuando haya una fuente
 * pública de límites; por ahora no se asigna desde la aplicación.
 */
#[Fillable(['name', 'slug'])]
#[Hidden(['area'])]
class Neighborhood extends Model
{
    /** @use HasFactory<NeighborhoodFactory> */
    use HasFactory;

    /** @var array<string, mixed> */
    protected $attributes = [
        'is_fictitious' => false,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_fictitious' => 'boolean',
        ];
    }

    /** @return HasMany<DeliveryZone, $this> */
    public function deliveryZones(): HasMany
    {
        return $this->hasMany(DeliveryZone::class);
    }

    /** @return BelongsToMany<Restaurant, $this, DeliveryZone, 'zone'> */
    public function restaurants(): BelongsToMany
    {
        return $this->belongsToMany(Restaurant::class, 'delivery_zones')
            ->using(DeliveryZone::class)
            ->as('zone')
            ->withPivot('id', 'fee')
            ->withTimestamps();
    }
}
