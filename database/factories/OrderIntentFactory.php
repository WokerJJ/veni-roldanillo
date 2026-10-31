<?php

namespace Database\Factories;

use App\Enums\Fulfillment;
use App\Models\OrderIntent;
use App\Models\Restaurant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Como los registra el carrito (#22, ADR 0031): sin persona ni dispositivo.
 *
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
            'fulfillment' => fake()->randomElement(Fulfillment::cases()),
            'user_id' => null,
            'device_hash' => null,
            'confirmed' => null,
        ];
    }
}
