<?php

namespace Database\Factories;

use App\Models\MenuSection;
use App\Models\Restaurant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MenuSection>
 */
class MenuSectionFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        /** @var string $name */
        $name = fake()->randomElement(['Platos fuertes', 'Entradas', 'Bebidas', 'Postres']);

        return [
            'restaurant_id' => Restaurant::factory(),
            'name_es' => "{$name} (prueba)",
            'name_en' => null,
            'position' => fake()->numberBetween(0, 10),
        ];
    }
}
