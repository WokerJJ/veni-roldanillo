<?php

namespace Database\Seeders;

use App\Models\Restaurant;
use App\Support\BusinessDay;

/**
 * «Almuerzos de hoy» de ejemplo (#12): publica el almuerzo del día de hoy en
 * Colombia en los restaurantes ficticios, menos en uno (La Chiminea, el que
 * tampoco tiene menú), para ver la sección con restaurantes que no publicaron.
 *
 * Solo toca restaurantes marcados como ficticios. Volver a correrlo no
 * duplica: actualiza el de hoy. Como los almuerzos son de un día, en
 * desarrollo se corre solo con `php artisan db:seed --class=DailyMenuSeeder`
 * para tener los de hoy sin volver a sembrar todo.
 */
class DailyMenuSeeder extends FictitiousSeeder
{
    /** El que queda sin almuerzo publicado. */
    private const string WITHOUT_LUNCH = 'prueba-la-chiminea';

    /**
     * Descripción en español e inglés y precio en pesos; se reparten en
     * orden. Inventados y rotulados «de prueba».
     *
     * @var list<array{string, string, int}>
     */
    private const array LUNCHES = [
        ['Almuerzo de prueba: sancocho, arroz, carne asada, ensalada y jugo.', 'Test lunch: sancocho, rice, grilled beef, salad and juice.', 15000],
        ['Almuerzo de prueba: sopa de verduras, arroz, pollo sudado y limonada.', 'Test lunch: vegetable soup, rice, stewed chicken and lemonade.', 13000],
        ['Almuerzo de prueba: fríjoles, arroz, chicharrón, maduro y jugo.', 'Test lunch: beans, rice, pork crackling, plantain and juice.', 16000],
        ['Almuerzo de prueba: crema de ahuyama, arroz, pescado frito y jugo.', 'Test lunch: pumpkin soup, rice, fried fish and juice.', 18000],
    ];

    protected function populate(): void
    {
        $today = BusinessDay::today()->toDateString();

        Restaurant::query()
            ->where('is_fictitious', true)
            ->where('slug', '!=', self::WITHOUT_LUNCH)
            ->orderBy('id')
            ->get(['id', 'slug'])
            ->each(function (Restaurant $restaurant, int $i) use ($today): void {
                [$es, $en, $price] = self::LUNCHES[$i % count(self::LUNCHES)];

                $restaurant->dailyMenus()->updateOrCreate(
                    ['served_on' => $today],
                    ['description_es' => $es, 'description_en' => $en, 'price' => $price],
                );
            });
    }
}
