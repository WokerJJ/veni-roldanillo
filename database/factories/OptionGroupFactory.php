<?php

namespace Database\Factories;

use App\Models\Dish;
use App\Models\OptionGroup;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Por defecto un grupo de adiciones opcionales; required() da una opción
 * obligatoria de una sola elección (p. ej. la proteína).
 *
 * @extends Factory<OptionGroup>
 */
class OptionGroupFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'dish_id' => Dish::factory(),
            'name_es' => 'Adiciones',
            'name_en' => 'Extras',
            'required' => false,
            'min_choices' => 0,
            'max_choices' => 3,
            'position' => 1,
        ];
    }

    public function required(): static
    {
        return $this->state(fn () => [
            'name_es' => 'Proteína',
            'name_en' => 'Protein',
            'required' => true,
            'min_choices' => 1,
            'max_choices' => 1,
            'position' => 0,
        ]);
    }
}
