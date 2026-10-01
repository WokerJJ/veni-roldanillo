<?php

namespace Database\Factories;

use App\Models\DeliveryZone;
use App\Models\Neighborhood;
use App\Models\Restaurant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DeliveryZone>
 */
class DeliveryZoneFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'restaurant_id' => Restaurant::factory(),
            'neighborhood_id' => Neighborhood::factory(),
            'fee' => fake()->numberBetween(2, 10) * 500,
        ];
    }
}
