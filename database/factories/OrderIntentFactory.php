<?php

namespace Database\Factories;

use App\Models\OrderIntent;
use App\Models\Restaurant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OrderIntent>
 */
class OrderIntentFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'restaurant_id' => Restaurant::factory(),
            'user_id' => null,
            'device_hash' => hash('sha256', fake()->uuid()),
            'confirmed' => null,
        ];
    }
}
