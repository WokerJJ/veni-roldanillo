<?php

namespace Database\Seeders;

use App\Enums\RestaurantRole;
use App\Models\Category;
use App\Models\Dish;
use App\Models\Neighborhood;
use App\Models\OptionGroup;
use App\Models\Restaurant;
use App\Models\User;
use App\Support\GeoPoint;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * Restaurantes ficticios con menú, horario, horarios especiales, almuerzo del
 * día y domicilios. Los nombres, los puntos y los platos son inventados:
 * ninguno es un negocio real ni su carta.
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

    /** Índice del restaurante que queda sin menú (La Chiminea) y del que queda sin horario (La Mesa Larga). */
    private const int WITHOUT_MENU = 3;

    private const int WITHOUT_HOURS = 5;

    /**
     * El menú de ejemplo: secciones, y por cada plato su nombre y su
     * descripción en español e inglés y el precio en pesos. Todo inventado y
     * rotulado «de prueba»: no es la carta de ningún negocio.
     *
     * @var list<array{string, string, list<array{string, string, string|null, string|null, int}>}>
     */
    private const array MENU = [
        ['Platos fuertes (prueba)', 'Main dishes (test)', [
            ['Sancocho de prueba', 'Test sancocho', 'Sopa de ejemplo con arroz y aguacate.', 'Sample soup with rice and avocado.', 18000],
            ['Bandeja de prueba', 'Test platter', 'Plato de ejemplo con fríjoles, arroz y carne.', 'Sample dish with beans, rice and meat.', 22000],
            ['Arroz con pollo de prueba', 'Test chicken rice', null, null, 16000],
        ]],
        ['Bebidas (prueba)', 'Drinks (test)', [
            ['Jugo de prueba', 'Test juice', 'En agua o en leche.', 'With water or milk.', 4000],
            ['Limonada de prueba', 'Test lemonade', null, null, 4500],
            ['Gaseosa de prueba', 'Test soda', null, null, 3500],
        ]],
        ['Postres (prueba)', 'Desserts (test)', [
            ['Postre de prueba', 'Test dessert', 'Dulce de ejemplo de la casa.', 'Sample house dessert.', 6000],
        ]],
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

            // Uno queda sin horario y otro sin menú, para ver la ficha cuando
            // el restaurante todavía no los cargó.
            if ($i !== self::WITHOUT_HOURS) {
                $this->seedHours($restaurant);
            }

            if ($i !== self::WITHOUT_MENU) {
                $this->seedMenu($restaurant, $i);
            }

            $this->seedSpecialHours($restaurant, $i);

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

    /**
     * Horarios especiales cerca de hoy, para verlos en la ficha: el primer
     * restaurante cierra un día y otro abre con otro horario; el segundo
     * cierra hoy, así su horario especial es el que vale ahora.
     */
    private function seedSpecialHours(Restaurant $restaurant, int $i): void
    {
        if ($i === 0) {
            $restaurant->specialHours()->createMany([
                [
                    'on_date' => now()->addDays(2)->toDateString(),
                    'closed' => true,
                    'note_es' => 'Cierre de prueba por mantenimiento',
                    'note_en' => 'Test closure for maintenance',
                ],
                [
                    'on_date' => now()->addDays(5)->toDateString(),
                    'closed' => false,
                    'opens_at' => '12:00',
                    'closes_at' => '16:00',
                    'note_es' => 'Horario de prueba por festivo',
                    'note_en' => 'Test holiday hours',
                ],
            ]);
        }

        if ($i === 1) {
            $restaurant->specialHours()->create([
                'on_date' => now()->toDateString(),
                'closed' => true,
                'note_es' => 'Cierre de prueba por hoy',
                'note_en' => 'Test closure for today',
            ]);
        }
    }

    /**
     * El menú de ejemplo, por secciones y en orden, con los mismos platos
     * inventados en todos los restaurantes; el precio cambia un poco con el
     * índice. En los restaurantes de índice par, un plato queda agotado hoy.
     *
     * Opciones (#14, ADR 0023), inventadas y rotuladas «(prueba)» como los
     * platos; viven en restaurantes con is_fictitious, que la ficha marca
     * «Datos de ejemplo». Los platos fuertes llevan proteína obligatoria,
     * adiciones con recargo e ingredientes para quitar; el jugo, la
     * preparación obligatoria; lo demás, ninguna. Una adición queda
     * desactivada, para ver que no sale.
     */
    private function seedMenu(Restaurant $restaurant, int $i): void
    {
        foreach (self::MENU as $position => [$nameEs, $nameEn, $dishes]) {
            $section = $restaurant->menuSections()->create(['name_es' => $nameEs, 'name_en' => $nameEn, 'position' => $position]);

            foreach ($dishes as $order => [$dishEs, $dishEn, $descriptionEs, $descriptionEn, $price]) {
                // Por la relación, sin restaurant_id suelto (ver Dish).
                $dish = $restaurant->dishes()->create([
                    'menu_section_id' => $section->id,
                    'name_es' => $dishEs,
                    'name_en' => $dishEn,
                    'description_es' => $descriptionEs,
                    'description_en' => $descriptionEn,
                    'price' => $price + ($i % 4) * 500,
                    'sold_out_until' => $position === 0 && $order === 1 && $i % 2 === 0 ? now()->toDateString() : null,
                    'position' => $order,
                ]);

                if ($position === 0) {
                    $this->seedMainOptions($dish);
                } elseif ($position === 1 && $order === 0) {
                    $this->seedOptions($dish, OptionGroup::factory()->required(), ['Preparación (prueba)', 'Preparation (test)'], [
                        ['En agua (prueba)', 'With water (test)', 0],
                        ['En leche (prueba)', 'With milk (test)', 500],
                    ]);
                }
            }
        }
    }

    /** Proteína obligatoria, adiciones con recargo e ingredientes para quitar. */
    private function seedMainOptions(Dish $dish): void
    {
        $this->seedOptions($dish, OptionGroup::factory()->required(), ['Proteína (prueba)', 'Protein (test)'], [
            ['Res (prueba)', 'Beef (test)', 0],
            ['Pollo (prueba)', 'Chicken (test)', 0],
            ['Cerdo (prueba)', 'Pork (test)', 1000],
        ]);

        $extras = $this->seedOptions($dish, OptionGroup::factory()->state(['max_choices' => 2, 'position' => 1]), ['Adiciones (prueba)', 'Extras (test)'], [
            ['Huevo (prueba)', 'Egg (test)', 1500],
            ['Aguacate (prueba)', 'Avocado (test)', 2000],
            ['Maduro (prueba)', 'Sweet plantain (test)', 1500],
        ]);
        // Desactivada por el dueño: la ficha no la publica.
        $extras->options()->create(['name_es' => 'Queso (prueba)', 'name_en' => 'Cheese (test)', 'price_delta' => 2500, 'available' => false, 'position' => 3]);

        $this->seedOptions($dish, OptionGroup::factory()->removal(), ['Quitar (prueba)', 'Remove (test)'], [
            ['Cebolla (prueba)', 'Onion (test)', 0],
            ['Cilantro (prueba)', 'Coriander (test)', 0],
        ]);
    }

    /**
     * Un grupo de opciones con sus opciones, en el orden de la lista.
     *
     * @param  Factory<OptionGroup>  $group
     * @param  array{string, string}  $name
     * @param  list<array{string, string, int}>  $options
     */
    private function seedOptions(Dish $dish, Factory $group, array $name, array $options): OptionGroup
    {
        $created = $group->for($dish)->createOne(['name_es' => $name[0], 'name_en' => $name[1]]);

        foreach ($options as $position => [$optionEs, $optionEn, $price]) {
            $created->options()->create(['name_es' => $optionEs, 'name_en' => $optionEn, 'price_delta' => $price, 'position' => $position]);
        }

        return $created;
    }
}
