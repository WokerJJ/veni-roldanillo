<?php

namespace Database\Seeders;

use App\Models\CatalogGroup;
use App\Models\CatalogItem;
use App\Models\CatalogVariant;
use Illuminate\Database\Seeder;

/**
 * El catálogo de partida del modo Campo (ADR 0050): lo que más se repite en
 * la carta de un restaurante colombiano, con sus presentaciones típicas.
 *
 * A diferencia de los seeders de ejemplo, es DATO DE REFERENCIA real y se
 * puede correr en producción (`php artisan db:seed --class=CatalogSeeder`):
 * solo agrega lo que falta y nunca pisa lo que administración ya editó (un
 * nombre cambiado, un producto desactivado). Solo texto: los nombres de los
 * productos como los vende el restaurante, nunca logos ni imágenes de marca.
 * Es un punto de partida, no una lista cerrada: administración lo completa
 * en /admin.
 */
class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        foreach (self::catalog() as $position => $group) {
            $model = CatalogGroup::query()->firstOrCreate(
                ['slug' => $group['slug']],
                [
                    'name_es' => $group['name_es'],
                    'name_en' => $group['name_en'],
                    'section_name_es' => $group['section_es'],
                    'section_name_en' => $group['section_en'],
                    'is_alcohol' => $group['alcohol'],
                    'position' => $position,
                ],
            );

            $order = 0;

            foreach ($group['items'] as [$brand, $names, $sizes]) {
                foreach ($names as $name) {
                    [$es, $en] = is_array($name) ? $name : [$name, null];

                    $item = CatalogItem::query()->firstOrCreate(
                        ['group_id' => $model->id, 'brand' => $brand, 'name_es' => $es],
                        ['name_en' => $en, 'is_alcohol' => $group['alcohol'], 'position' => $order++],
                    );

                    foreach ($sizes as $sizePosition => $label) {
                        CatalogVariant::query()->firstOrCreate(
                            ['item_id' => $item->id, 'label' => $label],
                            ['position' => $sizePosition],
                        );
                    }
                }
            }
        }
    }

    /**
     * @return list<array{slug: string, name_es: string, name_en: string, section_es: string, section_en: string, alcohol: bool, items: list<array{0: string|null, 1: list<string|array{0: string, 1: string}>, 2: list<string>}>}>
     */
    private static function catalog(): array
    {
        $soda = ['250 ml', '400 ml', '1,5 L', '2,5 L'];
        $water = ['300 ml', '600 ml', '1 L'];
        $juice = ['250 ml', '500 ml', '1 L'];
        $beer = ['Botella 330 ml', 'Lata 330 ml', 'Botella 750 ml'];
        $spirit = ['Trago', 'Media 375 ml', 'Botella 750 ml'];

        return [
            [
                'slug' => 'gaseosas', 'name_es' => 'Gaseosas', 'name_en' => 'Soft drinks',
                'section_es' => 'Bebidas', 'section_en' => 'Drinks', 'alcohol' => false,
                'items' => [
                    ['Postobón', [['Manzana', 'Apple'], ['Colombiana', 'Colombiana'], ['Uva', 'Grape'], ['Naranja', 'Orange'], ['Piña', 'Pineapple'], ['Quatro', 'Quatro']], $soda],
                    ['Coca-Cola', [['Coca-Cola', 'Coca-Cola'], ['Coca-Cola Zero', 'Coca-Cola Zero'], ['Sprite', 'Sprite'], ['Fanta', 'Fanta']], $soda],
                    ['Pepsi', [['Pepsi', 'Pepsi']], ['400 ml', '1,5 L', '2,5 L']],
                ],
            ],
            [
                'slug' => 'jugos-de-caja', 'name_es' => 'Jugos envasados', 'name_en' => 'Bottled juices',
                'section_es' => 'Bebidas', 'section_en' => 'Drinks', 'alcohol' => false,
                'items' => [
                    ['Hit', [['Mango', 'Mango'], ['Mora', 'Blackberry'], ['Lulo', 'Lulo'], ['Naranja', 'Orange'], ['Tropical', 'Tropical']], $juice],
                    ['Del Valle', [['Naranja', 'Orange'], ['Durazno', 'Peach'], ['Manzana', 'Apple']], $juice],
                ],
            ],
            [
                'slug' => 'aguas', 'name_es' => 'Aguas', 'name_en' => 'Water',
                'section_es' => 'Bebidas', 'section_en' => 'Drinks', 'alcohol' => false,
                'items' => [
                    ['Cristal', [['Agua', 'Water'], ['Agua con gas', 'Sparkling water']], $water],
                    ['Brisa', [['Agua', 'Water']], $water],
                ],
            ],
            [
                'slug' => 'energizantes', 'name_es' => 'Energizantes', 'name_en' => 'Energy drinks',
                'section_es' => 'Bebidas', 'section_en' => 'Drinks', 'alcohol' => false,
                'items' => [
                    ['Red Bull', [['Energizante', 'Energy drink']], ['250 ml']],
                    ['Speed Max', [['Energizante', 'Energy drink']], ['269 ml']],
                    ['Monster', [['Energizante', 'Energy drink']], ['473 ml']],
                    ['Vive 100', [['Energizante', 'Energy drink']], ['250 ml']],
                ],
            ],
            [
                'slug' => 'jugos-naturales', 'name_es' => 'Jugos naturales', 'name_en' => 'Fresh juices',
                'section_es' => 'Jugos naturales', 'section_en' => 'Fresh juices', 'alcohol' => false,
                'items' => [
                    [null, [['Mora', 'Blackberry'], ['Lulo', 'Lulo'], ['Maracuyá', 'Passion fruit'], ['Mango', 'Mango'], ['Guanábana', 'Soursop'], ['Fresa', 'Strawberry'], ['Naranja', 'Orange'], ['Limonada', 'Lemonade']], ['Vaso', 'Jarra']],
                ],
            ],
            [
                'slug' => 'adicionales', 'name_es' => 'Adicionales', 'name_en' => 'Extras',
                'section_es' => 'Adicionales', 'section_en' => 'Extras', 'alcohol' => false,
                'items' => [
                    [null, [['Arroz', 'Rice'], ['Papa frita', 'French fries'], ['Huevo', 'Egg'], ['Aguacate', 'Avocado'], ['Tajadas de plátano', 'Fried plantain'], ['Ensalada', 'Salad'], ['Queso', 'Cheese']], []],
                ],
            ],
            [
                'slug' => 'cervezas', 'name_es' => 'Cervezas', 'name_en' => 'Beers',
                'section_es' => 'Cervezas', 'section_en' => 'Beers', 'alcohol' => true,
                'items' => [
                    ['Águila', [['Cerveza Águila', 'Águila beer'], ['Cerveza Águila Light', 'Águila Light beer']], $beer],
                    ['Poker', [['Cerveza Poker', 'Poker beer']], $beer],
                    ['Club Colombia', [['Cerveza Club Colombia Dorada', 'Club Colombia Dorada beer'], ['Cerveza Club Colombia Roja', 'Club Colombia Roja beer'], ['Cerveza Club Colombia Negra', 'Club Colombia Negra beer']], ['Botella 330 ml', 'Lata 330 ml']],
                    ['Costeña', [['Cerveza Costeña', 'Costeña beer']], ['Botella 330 ml', 'Lata 330 ml']],
                    ['Corona', [['Cerveza Corona', 'Corona beer']], ['Botella 330 ml']],
                    ['Heineken', [['Cerveza Heineken', 'Heineken beer']], ['Botella 330 ml', 'Lata 330 ml']],
                ],
            ],
            [
                'slug' => 'licores', 'name_es' => 'Licores', 'name_en' => 'Spirits',
                'section_es' => 'Licores', 'section_en' => 'Spirits', 'alcohol' => true,
                'items' => [
                    ['Antioqueño', [['Aguardiente Antioqueño Tapa Azul', 'Antioqueño aguardiente (blue cap)'], ['Aguardiente Antioqueño Tapa Roja', 'Antioqueño aguardiente (red cap)']], $spirit],
                    ['Blanco del Valle', [['Aguardiente Blanco del Valle', 'Blanco del Valle aguardiente']], $spirit],
                    ['Néctar', [['Aguardiente Néctar', 'Néctar aguardiente']], $spirit],
                    ['Medellín', [['Ron Medellín', 'Medellín rum']], $spirit],
                    ['Viejo de Caldas', [['Ron Viejo de Caldas', 'Viejo de Caldas rum']], $spirit],
                ],
            ],
        ];
    }
}
