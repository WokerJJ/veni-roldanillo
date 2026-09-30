<?php

namespace Database\Seeders;

use App\Models\Category;

/**
 * Tipos de comida genéricos (clasificación, no datos de negocios).
 */
class CategorySeeder extends FictitiousSeeder
{
    protected function populate(): void
    {
        $categories = [
            ['comida-tipica', 'Comida típica', 'Traditional food'],
            ['comidas-rapidas', 'Comidas rápidas', 'Fast food'],
            ['asados', 'Asados', 'Grill'],
            ['panaderia-cafeteria', 'Panadería y cafetería', 'Bakery and café'],
            ['pescados-mariscos', 'Pescados y mariscos', 'Fish and seafood'],
            ['heladeria-postres', 'Heladería y postres', 'Ice cream and desserts'],
        ];

        foreach ($categories as $position => [$slug, $es, $en]) {
            Category::query()->updateOrCreate(
                ['slug' => $slug],
                ['name_es' => $es, 'name_en' => $en, 'position' => $position],
            );
        }
    }
}
