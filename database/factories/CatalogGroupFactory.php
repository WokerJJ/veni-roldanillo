<?php

namespace Database\Factories;

use App\Models\CatalogGroup;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CatalogGroup>
 */
class CatalogGroupFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $n = fake()->unique()->numberBetween(1, 999_999);

        return [
            'slug' => "grupo-de-prueba-{$n}",
            'name_es' => "Grupo de prueba {$n}",
            'name_en' => "Test group {$n}",
            'section_name_es' => 'Bebidas',
            'section_name_en' => 'Drinks',
            'is_alcohol' => false,
            'active' => true,
            'position' => 0,
        ];
    }

    public function alcohol(): static
    {
        return $this->state(fn () => ['is_alcohol' => true, 'section_name_es' => 'Licores', 'section_name_en' => 'Spirits']);
    }
}
