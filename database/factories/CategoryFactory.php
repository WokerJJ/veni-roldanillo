<?php

namespace Database\Factories;

use App\Models\Category;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Category>
 */
class CategoryFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $n = fake()->unique()->numberBetween(1, 999_999);

        return [
            'slug' => "categoria-de-prueba-{$n}",
            'name_es' => "Categoría de prueba {$n}",
            'name_en' => "Test category {$n}",
            'position' => 0,
        ];
    }
}
