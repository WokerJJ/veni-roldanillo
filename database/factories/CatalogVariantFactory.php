<?php

namespace Database\Factories;

use App\Models\CatalogItem;
use App\Models\CatalogVariant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CatalogVariant>
 */
class CatalogVariantFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'item_id' => CatalogItem::factory(),
            'label' => fake()->unique()->numerify('### ml'),
            'active' => true,
            'position' => 0,
        ];
    }
}
