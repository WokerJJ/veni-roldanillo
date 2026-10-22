<?php

namespace Database\Factories;

use App\Enums\OptionGroupKind;
use App\Models\Dish;
use App\Models\OptionGroup;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Por defecto un grupo de adiciones opcionales; required() da una opción
 * obligatoria de una sola elección (p. ej. la proteína) y removal(), los
 * ingredientes que se pueden quitar.
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
            'kind' => OptionGroupKind::Choice,
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

    /** Ingredientes que se pueden quitar (ADR 0023): nunca obligatorio. */
    public function removal(): static
    {
        return $this->state(fn () => [
            'kind' => OptionGroupKind::Removal,
            'name_es' => 'Quitar',
            'name_en' => 'Remove',
            'required' => false,
            'min_choices' => 0,
            'max_choices' => 3,
            'position' => 2,
        ]);
    }
}
