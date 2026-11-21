<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;

/**
 * Los tipos de comida: clasificación, no datos de negocios ni de ejemplo. Es
 * DATO DE REFERENCIA y puede correr en producción (`php artisan
 * veni:cargar-referencia`): solo agrega lo que falta y no repite nada.
 */
class ReferenceCategorySeeder extends Seeder
{
    public function run(): void
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
