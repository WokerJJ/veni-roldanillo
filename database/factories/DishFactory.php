<?php

namespace Database\Factories;

use App\Models\Dish;
use App\Models\MenuSection;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * El restaurante del plato sale de su sección (la FK compuesta lo exige).
 *
 * @extends Factory<Dish>
 */
class DishFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'menu_section_id' => MenuSection::factory(),
            'restaurant_id' => fn (array $attributes) => MenuSection::query()
                ->whereKey($attributes['menu_section_id'])
                ->firstOrFail()
                ->restaurant_id,
            'name_es' => 'Plato de prueba '.fake()->numberBetween(1, 999),
            'name_en' => null,
            'description_es' => 'Descripción de ejemplo.',
            'description_en' => null,
            'price' => fake()->numberBetween(8, 40) * 500,
            'photo_path' => null,
            'tags' => [],
            'available' => true,
            'sold_out_until' => null,
            'position' => fake()->numberBetween(0, 20),
        ];
    }

    public function soldOutToday(): static
    {
        return $this->state(fn () => ['sold_out_until' => now()->toDateString()]);
    }
}
