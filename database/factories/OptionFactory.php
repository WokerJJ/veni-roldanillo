<?php

namespace Database\Factories;

use App\Models\Option;
use App\Models\OptionGroup;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Option>
 */
class OptionFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        /** @var string $name */
        $name = fake()->randomElement(['Huevo', 'Queso', 'Aguacate', 'Maduro', 'Arroz']);

        return [
            'option_group_id' => OptionGroup::factory(),
            'name_es' => "{$name} (prueba)",
            'name_en' => null,
            'price_delta' => fake()->numberBetween(0, 8) * 500,
            'available' => true,
            'position' => fake()->numberBetween(0, 10),
        ];
    }
}
