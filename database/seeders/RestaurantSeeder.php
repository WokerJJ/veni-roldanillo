<?php

namespace Database\Seeders;

use App\Enums\RestaurantRole;
use App\Models\Category;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Neighborhood;
use App\Models\Option;
use App\Models\OptionGroup;
use App\Models\Restaurant;
use App\Models\User;
use App\Support\GeoPoint;
use Illuminate\Support\Str;

/**
 * Restaurantes ficticios con menú, horario, almuerzo del día y domicilios.
 * Los nombres y los puntos son inventados: ninguno es un negocio real.
 */
class RestaurantSeeder extends FictitiousSeeder
{
    /**
     * Nombre y punto (latitud, longitud) de cada restaurante. Los puntos
     * reparten los restaurantes por el casco urbano de Roldanillo, para que el
     * mapa del inicio los muestre separados apenas abre; La Ceiba y El Patio
     * Lila quedan a media cuadra, para ver cómo se juntan en un grupo. Son
     * fijos, no al azar: la misma siembra da siempre el mismo mapa.
     *
     * @var list<array{string, float, float}>
     */
    private const array RESTAURANTS = [
        ['La Ceiba', 4.4128, -76.1547],
        ['El Guadual', 4.4093, -76.1556],
        ['Los Totumos', 4.4162, -76.1560],
        ['La Chiminea', 4.4150, -76.1500],
        ['El Fogón Azul', 4.4118, -76.1598],
        ['La Mesa Larga', 4.4100, -76.1492],
        ['El Patio Lila', 4.4132, -76.1542],
        ['Las Tres Ollas', 4.4075, -76.1520],
    ];

    /**
     * El primero queda reclamado por la dueña de prueba y el último, oculto.
     * Categorías, domicilios y zonas salen del índice de cada restaurante (no
     * al azar): la misma siembra da siempre los mismos datos de domicilio.
     */
    protected function populate(): void
    {
        $categories = Category::query()->orderBy('id')->pluck('id');
        $neighborhoods = Neighborhood::query()->orderBy('id')->pluck('id');
        $owner = User::query()->where('email', 'duena@example.test')->first();

        if ($categories->isEmpty()) {
            $categories = collect([Category::factory()->create()->id]);
        }

        foreach (self::RESTAURANTS as $i => [$base, $latitude, $longitude]) {
            $factory = Restaurant::factory();

            if ($i === 0) {
                $factory = $factory->claimed();
            } elseif ($i === count(self::RESTAURANTS) - 1) {
                $factory = $factory->hidden();
            }

            $restaurant = $factory->create([
                'name' => "Restaurante de Prueba {$base} (ficticio)",
                'slug' => Str::slug("prueba {$base}"),
                'location' => new GeoPoint($latitude, $longitude),
                'delivery' => $i % 2 === 0,
            ]);

            // Una categoría por restaurante y, cada tres, una segunda.
            $restaurant->categories()->attach(
                collect([$categories[$i % $categories->count()], $categories[($i + 1) % $categories->count()]])
                    ->take($i % 3 === 0 ? 2 : 1)
                    ->unique()
                    ->all(),
            );

            if ($i === 0 && $owner !== null) {
                $restaurant->members()->attach($owner, ['role' => RestaurantRole::Owner->value]);
            }

            $this->seedHours($restaurant);
            $this->seedMenu($restaurant);

            $restaurant->dailyMenus()->create([
                'served_on' => now()->toDateString(),
                'description_es' => 'Almuerzo de prueba: sopa, arroz, principio, proteína y jugo.',
                'description_en' => 'Test lunch: soup, rice, side, protein and juice.',
                'price' => fake()->numberBetween(24, 36) * 500,
            ]);

            if ($restaurant->delivery && $neighborhoods->isNotEmpty()) {
                foreach (range(0, min(3, $neighborhoods->count()) - 1) as $k) {
                    $restaurant->deliveryZones()->create([
                        'neighborhood_id' => $neighborhoods[($i + $k) % $neighborhoods->count()],
                        'fee' => (2 + ($i + $k) % 5) * 500,
                    ]);
                }
            }
        }
    }

    /**
     * Lunes a sábado, almuerzo y comida; domingo solo almuerzo.
     */
    private function seedHours(Restaurant $restaurant): void
    {
        foreach (range(1, 6) as $weekday) {
            $restaurant->openingHours()->createMany([
                ['weekday' => $weekday, 'opens_at' => '11:00', 'closes_at' => '15:00'],
                ['weekday' => $weekday, 'opens_at' => '18:00', 'closes_at' => '22:00'],
            ]);
        }

        $restaurant->openingHours()->create(['weekday' => 0, 'opens_at' => '11:00', 'closes_at' => '16:00']);
    }

    private function seedMenu(Restaurant $restaurant): void
    {
        $sections = MenuSection::factory()
            ->count(2)
            ->sequence(
                ['name_es' => 'Platos fuertes (prueba)', 'name_en' => 'Main dishes (test)', 'position' => 0],
                ['name_es' => 'Bebidas (prueba)', 'name_en' => 'Drinks (test)', 'position' => 1],
            )
            ->for($restaurant)
            ->create();

        foreach ($sections as $section) {
            // Por las relaciones, sin restaurant_id suelto (ver Dish).
            $dishes = Dish::factory()->count(3)->for($section)->for($restaurant)->create();

            if ($section->position !== 0) {
                continue;
            }

            // Platos fuertes: proteína obligatoria y adiciones con recargo.
            foreach ($dishes as $dish) {
                $protein = OptionGroup::factory()->required()->for($dish)->create();
                Option::factory()->count(3)->for($protein)
                    ->sequence(['name_es' => 'Res (prueba)'], ['name_es' => 'Pollo (prueba)'], ['name_es' => 'Cerdo (prueba)'])
                    ->create(['price_delta' => 0]);

                $extras = OptionGroup::factory()->for($dish)->create();
                Option::factory()->count(2)->for($extras)->create();
            }
        }
    }
}
