<?php

namespace Database\Seeders;

use App\Models\Dish;
use App\Models\Ingredient;
use App\Models\Restaurant;

/**
 * Ingredientes de ejemplo (#112, ADR 0033), inventados y rotulados «(prueba)»
 * como los platos, solo en restaurantes con is_fictitious. Ninguno queda
 * agotado: se marca desde el panel para ver los tres casos (esencial, sin
 * reemplazo y con reemplazo).
 *
 * Se puede correr sola sobre una base ya sembrada
 * (php artisan db:seed --class=IngredientSeeder): un restaurante que ya
 * tiene ingredientes no se toca.
 */
class IngredientSeeder extends FictitiousSeeder
{
    /** @var array<string, array{string, string}> clave => [ES, EN] */
    private const array INGREDIENTS = [
        'arroz' => ['Arroz (prueba)', 'Rice (test)'],
        'frijoles' => ['Fríjoles (prueba)', 'Beans (test)'],
        'tomate' => ['Tomate (prueba)', 'Tomato (test)'],
        'pepino' => ['Pepino (prueba)', 'Cucumber (test)'],
        'cebolla' => ['Cebolla (prueba)', 'Onion (test)'],
        'cilantro' => ['Cilantro (prueba)', 'Coriander (test)'],
        'aguacate' => ['Aguacate (prueba)', 'Avocado (test)'],
        'huevo' => ['Huevo (prueba)', 'Egg (test)'],
    ];

    /**
     * Qué lleva cada plato fuerte de RestaurantSeeder: clave => esencial.
     *
     * @var array<string, array<string, bool>>
     */
    private const array DISHES = [
        'Sancocho de prueba' => ['arroz' => false, 'cilantro' => false, 'cebolla' => false, 'aguacate' => false],
        'Bandeja de prueba' => ['frijoles' => true, 'arroz' => false, 'tomate' => false, 'cebolla' => false],
        'Arroz con pollo de prueba' => ['arroz' => true, 'tomate' => false, 'cebolla' => false, 'cilantro' => false],
    ];

    protected function populate(): void
    {
        $restaurants = Restaurant::query()
            ->where('is_fictitious', true)
            ->whereHas('dishes')
            ->whereDoesntHave('ingredients')
            ->with('dishes.optionGroups.options')
            ->get();

        foreach ($restaurants as $restaurant) {
            /** @var array<string, Ingredient> $ingredients */
            $ingredients = [];

            foreach (self::INGREDIENTS as $key => [$es, $en]) {
                $ingredients[$key] = $restaurant->ingredients()->create(['name_es' => $es, 'name_en' => $en]);
            }

            // El tomate se reemplaza por pepino, con recargo.
            $ingredients['tomate']->update(['substitute_ingredient_id' => $ingredients['pepino']->id, 'substitute_price_delta' => 500]);

            foreach ($restaurant->dishes as $dish) {
                $this->link($dish, $ingredients);
            }
        }
    }

    /**
     * Los ingredientes del plato y, en sus opciones, las que son un
     * ingrediente (quitar cebolla o cilantro, la adición de aguacate o huevo).
     *
     * @param  array<string, Ingredient>  $ingredients
     */
    private function link(Dish $dish, array $ingredients): void
    {
        foreach (self::DISHES[$dish->name_es] ?? [] as $key => $essential) {
            // restaurant_id a mano: DatabaseSeeder corre sin eventos de modelo.
            $dish->dishIngredients()->make(['ingredient_id' => $ingredients[$key]->id, 'essential' => $essential])
                ->forceFill(['restaurant_id' => $dish->restaurant_id])
                ->save();
        }

        $byName = [];

        foreach ($ingredients as $ingredient) {
            $byName[$ingredient->name_es] = $ingredient->id;
        }

        foreach ($dish->optionGroups as $group) {
            foreach ($group->options as $option) {
                if (isset($byName[$option->name_es])) {
                    $option->update(['ingredient_id' => $byName[$option->name_es]]);
                }
            }
        }
    }
}
