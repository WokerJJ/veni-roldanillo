<?php

namespace Database\Factories;

use App\Models\CatalogGroup;
use App\Models\CatalogItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CatalogItem>
 */
class CatalogItemFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $n = fake()->unique()->numberBetween(1, 999_999);

        return [
            'group_id' => CatalogGroup::factory(),
            'brand' => 'Marca de Prueba',
            'name_es' => "Producto de prueba {$n}",
            'name_en' => "Test product {$n}",
            'is_alcohol' => false,
            'active' => true,
            'position' => 0,
        ];
    }

    public function alcohol(): static
    {
        return $this->state(fn () => ['is_alcohol' => true]);
    }
}
