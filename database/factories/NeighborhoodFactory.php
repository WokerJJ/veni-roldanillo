<?php

namespace Database\Factories;

use App\Models\Neighborhood;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Barrios inventados y marcados como ficticios.
 *
 * @extends Factory<Neighborhood>
 */
class NeighborhoodFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $n = fake()->unique()->numberBetween(1, 999_999);

        return [
            'name' => "Barrio de Prueba {$n} (ficticio)",
            'slug' => "barrio-de-prueba-{$n}",
            'is_fictitious' => true,
        ];
    }
}
