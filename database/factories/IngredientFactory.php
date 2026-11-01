<?php

namespace Database\Factories;

use App\Models\Ingredient;
use App\Models\Restaurant;
use App\Support\BusinessDay;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Ingredient>
 */
class IngredientFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'restaurant_id' => Restaurant::factory(),
            'name_es' => fake()->unique()->word().' (prueba)',
            'name_en' => null,
            'sold_out_until' => null,
            'substitute_ingredient_id' => null,
            'substitute_price_delta' => 0,
        ];
    }

    /** Agotado hoy (día de Colombia). */
    public function soldOutToday(): static
    {
        return $this->state(fn (): array => ['sold_out_until' => BusinessDay::today()->toDateString()]);
    }
}
