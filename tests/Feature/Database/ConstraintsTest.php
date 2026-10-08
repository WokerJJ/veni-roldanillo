<?php

/*
| Restricciones del esquema. En PostgreSQL una violación aborta la transacción
| de RefreshDatabase, así que cada prueba provoca una sola y al final.
*/

use App\Models\Category;
use App\Models\DailyMenu;
use App\Models\DeliveryZone;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Neighborhood;
use App\Models\OpeningHour;
use App\Models\Option;
use App\Models\OptionGroup;
use App\Models\OrderIntent;
use App\Models\Promotion;
use App\Models\Restaurant;
use App\Models\RestaurantClaim;
use App\Models\SpecialHour;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

test('el slug del restaurante es único', function () {
    Restaurant::factory()->create(['slug' => 'prueba-repetida']);
    Restaurant::factory()->create(['slug' => 'prueba-repetida']);
})->throws(QueryException::class, 'restaurants_slug_unique');

test('el slug solo admite minúsculas, dígitos y guiones', function () {
    Restaurant::factory()->create(['slug' => 'Con Espacios']);
})->throws(QueryException::class, 'restaurants_slug_format');

test('el WhatsApp es un celular colombiano: 57 y diez dígitos', function (string $whatsapp) {
    // Por la tabla, sin el mutador del modelo que normaliza.
    DB::table('restaurants')->where('id', Restaurant::factory()->create()->id)->update(['whatsapp' => $whatsapp]);
})->with([
    'con +' => '+573001234567',
    'sin indicativo' => '3001234567',
    'otro país' => '12025550123',
    'un dígito de más' => '5730012345678',
])->throws(QueryException::class, 'restaurants_whatsapp_format');

test('el estado solo admite los valores del enum', function () {
    DB::table('restaurants')->where('id', Restaurant::factory()->create()->id)->update(['status' => 'publicado']);
})->throws(QueryException::class, 'restaurants_status_check');

test('la ubicación es obligatoria', function () {
    Restaurant::factory()->create(['location' => null]);
})->throws(QueryException::class, 'location');

test('la ubicación no puede ser un punto vacío', function () {
    // PostGIS lo guarda en una columna de puntos, pero no tiene coordenadas que leer.
    DB::table('restaurants')->where('id', Restaurant::factory()->create()->id)
        ->update(['location' => DB::raw("'SRID=4326;POINT EMPTY'::geography")]);
})->throws(QueryException::class, 'restaurants_location_not_empty');

test('no se borra una categoría con restaurantes', function () {
    $category = Category::factory()->create();
    Restaurant::factory()->hasAttached($category)->create();

    $category->delete();
})->throws(QueryException::class, 'category_restaurant_category_id_foreign');

test('un restaurante no repite categoría', function () {
    $category = Category::factory()->create();
    $restaurant = Restaurant::factory()->hasAttached($category)->create();

    DB::table('category_restaurant')->insert(['category_id' => $category->id, 'restaurant_id' => $restaurant->id]);
})->throws(QueryException::class, 'category_restaurant_pkey');

test('borrar un restaurante borra en cascada su menú, horarios y zonas', function () {
    $section = MenuSection::factory()->create();
    $dish = Dish::factory()->for($section)->create();
    OptionGroup::factory()->for($dish)->create();
    OpeningHour::factory()->for($section->restaurant)->create();
    DeliveryZone::factory()->for($section->restaurant)->create();

    $section->restaurant->delete();

    expect(MenuSection::query()->count())->toBe(0)
        ->and(Dish::query()->count())->toBe(0)
        ->and(OptionGroup::query()->count())->toBe(0)
        ->and(OpeningHour::query()->count())->toBe(0)
        ->and(DeliveryZone::query()->count())->toBe(0)
        ->and(Neighborhood::query()->count())->toBe(1);
});

test('un plato no puede usar la sección de otro restaurante', function () {
    $section = MenuSection::factory()->create();
    $other = Restaurant::factory()->create();

    Dish::factory()->create([
        'menu_section_id' => $section->id,
        'restaurant_id' => $other->id,
    ]);
})->throws(QueryException::class, 'dishes_menu_section_id_restaurant_id_foreign');

test('no se borra una sección que todavía tiene platos', function () {
    $dish = Dish::factory()->create();

    $dish->menuSection->delete();
})->throws(QueryException::class, 'dishes_menu_section_id_restaurant_id_foreign');

test('los precios no pueden ser negativos', function () {
    Dish::factory()->create(['price' => -500]);
})->throws(QueryException::class, 'dishes_price_non_negative');

test('un grupo obligatorio exige al menos una elección', function () {
    OptionGroup::factory()->create(['required' => true, 'min_choices' => 0]);
})->throws(QueryException::class, 'option_groups_choices_range');

test('el máximo de elecciones no puede ser menor que el mínimo', function () {
    OptionGroup::factory()->create(['required' => true, 'min_choices' => 2, 'max_choices' => 1]);
})->throws(QueryException::class, 'option_groups_choices_range');

test('el día de la semana va de 0 a 6', function () {
    OpeningHour::factory()->create(['weekday' => 7]);
})->throws(QueryException::class, 'opening_hours_weekday_range');

test('un horario especial abierto necesita sus horas', function () {
    SpecialHour::factory()->create(['closed' => false]);
})->throws(QueryException::class, 'special_hours_closed_or_hours');

test('un barrio con zonas de domicilio no se borra', function () {
    $zone = DeliveryZone::factory()->create();

    $zone->neighborhood->delete();
})->throws(QueryException::class, 'delivery_zones_neighborhood_id_foreign');

test('un restaurante no repite barrio en sus zonas de domicilio', function () {
    $zone = DeliveryZone::factory()->create();

    DeliveryZone::factory()->create([
        'restaurant_id' => $zone->restaurant_id,
        'neighborhood_id' => $zone->neighborhood_id,
    ]);
})->throws(QueryException::class, 'delivery_zones_restaurant_id_neighborhood_id_unique');

test('solo hay una reclamación pendiente por usuario y restaurante', function () {
    $claim = RestaurantClaim::factory()->create();

    RestaurantClaim::factory()->create([
        'restaurant_id' => $claim->restaurant_id,
        'user_id' => $claim->user_id,
    ]);
})->throws(QueryException::class, 'restaurant_claims_one_pending');

test('una reclamación resuelta puede repetirse como nueva solicitud', function () {
    $claim = RestaurantClaim::factory()->rejected()->create();

    RestaurantClaim::factory()->create([
        'restaurant_id' => $claim->restaurant_id,
        'user_id' => $claim->user_id,
    ]);

    expect(RestaurantClaim::query()->count())->toBe(2);
});

test('una reclamación resuelta lleva fecha de resolución', function () {
    RestaurantClaim::factory()->create(['status' => 'approved', 'reviewed_at' => null]);
})->throws(QueryException::class, 'restaurant_claims_review_consistency');

test('borrar un usuario deja sus intenciones de pedido anónimas', function () {
    $intent = OrderIntent::factory()->for(User::factory())->create();

    $other = OrderIntent::factory()->create();

    expect($intent->device_hash)->not->toBeNull();

    $intent->user?->delete();

    $fresh = DB::table('order_intents')->where('id', $intent->id)->first();

    expect($fresh?->user_id)->toBeNull()
        ->and($fresh?->device_hash)->toBeNull()
        ->and($other->fresh()?->device_hash)->toBe($other->device_hash);
});

test('order_intents no tiene columnas de dirección, contenido ni ubicación', function () {
    expect(Schema::getColumnListing('order_intents'))->toEqualCanonicalizing([
        'id', 'restaurant_id', 'user_id', 'device_hash', 'confirmed', 'created_at', 'updated_at',
    ]);
});

test('ninguna tabla guarda coordenadas salvo restaurantes y barrios', function () {
    $geo = collect(DB::select(
        "SELECT f_table_name AS t FROM geography_columns WHERE f_table_schema = 'public'"
    ))->pluck('t')->sort()->values()->all();

    expect($geo)->toBe(['neighborhoods', 'restaurants']);
});

test('ninguna tabla tiene columnas de ubicación o dirección salvo restaurantes y barrios', function () {
    $columns = collect(DB::select(<<<'SQL'
        SELECT c.table_name || '.' || c.column_name AS c
        FROM information_schema.columns c
        JOIN information_schema.tables t USING (table_schema, table_name)
        -- Solo tablas: las vistas de PostGIS (geometry_columns…) no guardan datos.
        WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
          AND table_name NOT IN ('restaurants', 'neighborhoods')
          -- La IP de la sesión es del framework (seguridad de la sesión), no una dirección postal.
          AND NOT (table_name = 'sessions' AND column_name = 'ip_address')
          AND column_name ~* '(^|_)(lat|lng|lon|latitude|longitude|location|coords?|geom|address|direccion|ubicacion)(_|$)'
        SQL))->pluck('c')->all();

    expect($columns)->toBe([]);
});

/*
| Restricciones que faltaban por cubrir.
*/

test('una promoción termina después de empezar', function () {
    Promotion::factory()->create(['starts_at' => now(), 'ends_at' => now()]);
})->throws(QueryException::class, 'promotions_valid_period');

test('el device_hash es un SHA-256 en hexadecimal', function () {
    OrderIntent::factory()->create(['device_hash' => 'dispositivo-sin-hash']);
})->throws(QueryException::class, 'order_intents_device_hash_format');

test('el recargo de una opción no es negativo', function () {
    Option::factory()->create(['price_delta' => -500]);
})->throws(QueryException::class, 'options_price_delta_non_negative');

test('el nivel de precio va de 1 a 4', function (int $level) {
    Restaurant::factory()->create(['price_level' => $level]);
})->with([0, 5])->throws(QueryException::class, 'restaurants_price_level_range');

test('los medios de pago son una lista', function () {
    DB::table('restaurants')->where('id', Restaurant::factory()->create()->id)
        ->update(['payment_methods' => DB::raw("'{\"cash\": true}'::jsonb")]);
})->throws(QueryException::class, 'restaurants_payment_methods_array');

test('los medios de pago solo admiten los valores del enum', function () {
    DB::table('restaurants')->where('id', Restaurant::factory()->create()->id)
        ->update(['payment_methods' => DB::raw("'[\"cash\", \"bitcoin\"]'::jsonb")]);
})->throws(QueryException::class, 'restaurants_payment_methods_known');

test('una franja del horario no abre y cierra a la misma hora', function () {
    OpeningHour::factory()->create(['opens_at' => '11:00', 'closes_at' => '11:00']);
})->throws(QueryException::class, 'opening_hours_not_empty');

test('un restaurante tiene un solo almuerzo del día por fecha', function () {
    $menu = DailyMenu::factory()->create();

    DailyMenu::factory()->for($menu->restaurant)->create(['served_on' => $menu->served_on]);
})->throws(QueryException::class, 'daily_menus_restaurant_id_served_on_unique');

test('el slug de una categoría solo admite minúsculas, dígitos y guiones', function () {
    Category::factory()->create(['slug' => 'Comida Típica']);
})->throws(QueryException::class, 'categories_slug_format');

test('el slug de una categoría es único', function () {
    Category::factory()->create(['slug' => 'asados']);
    Category::factory()->create(['slug' => 'asados']);
})->throws(QueryException::class, 'categories_slug_unique');

test('el slug de un barrio solo admite minúsculas, dígitos y guiones', function () {
    Neighborhood::factory()->create(['slug' => 'barrio_centro']);
})->throws(QueryException::class, 'neighborhoods_slug_format');

test('el slug de un barrio es único', function () {
    Neighborhood::factory()->create(['slug' => 'barrio-centro']);
    Neighborhood::factory()->create(['slug' => 'barrio-centro']);
})->throws(QueryException::class, 'neighborhoods_slug_unique');

/*
| Horarios: sin franjas solapadas ni «cerrado» mezclado con franjas.
*/

test('las franjas del horario semanal no se solapan el mismo día', function (array $first, array $second) {
    $restaurant = Restaurant::factory()->create();
    OpeningHour::factory()->for($restaurant)->create(['weekday' => 1, ...$first]);

    OpeningHour::factory()->for($restaurant)->create(['weekday' => 1, ...$second]);
})->with([
    'se cruzan' => [['opens_at' => '11:00', 'closes_at' => '15:00'], ['opens_at' => '14:00', 'closes_at' => '18:00']],
    'una dentro de otra' => [['opens_at' => '11:00', 'closes_at' => '22:00'], ['opens_at' => '12:00', 'closes_at' => '13:00']],
    'misma apertura' => [['opens_at' => '11:00', 'closes_at' => '15:00'], ['opens_at' => '11:00', 'closes_at' => '12:00']],
    'pasa la medianoche' => [['opens_at' => '20:00', 'closes_at' => '02:00'], ['opens_at' => '23:00', 'closes_at' => '23:30']],
])->throws(QueryException::class, 'opening_hours_no_overlap');

test('franjas seguidas, de otro día o de otro restaurante sí se permiten', function () {
    $restaurant = Restaurant::factory()->create();
    OpeningHour::factory()->for($restaurant)->create(['weekday' => 1, 'opens_at' => '11:00', 'closes_at' => '15:00']);
    OpeningHour::factory()->for($restaurant)->create(['weekday' => 1, 'opens_at' => '15:00', 'closes_at' => '18:00']);
    OpeningHour::factory()->for($restaurant)->create(['weekday' => 1, 'opens_at' => '20:00', 'closes_at' => '02:00']);
    OpeningHour::factory()->for($restaurant)->create(['weekday' => 2, 'opens_at' => '11:00', 'closes_at' => '15:00']);
    OpeningHour::factory()->create(['weekday' => 1, 'opens_at' => '11:00', 'closes_at' => '15:00']);

    expect(OpeningHour::query()->count())->toBe(5);
});

test('un día especial no mezcla «cerrado» con franjas ni solapa franjas', function (array $first, array $second) {
    $restaurant = Restaurant::factory()->create();
    SpecialHour::factory()->for($restaurant)->create(['on_date' => '2026-12-24', ...$first]);

    SpecialHour::factory()->for($restaurant)->create(['on_date' => '2026-12-24', ...$second]);
})->with([
    'cerrado y abierto' => [['closed' => true], ['closed' => false, 'opens_at' => '12:00', 'closes_at' => '16:00']],
    'abierto y cerrado' => [['closed' => false, 'opens_at' => '12:00', 'closes_at' => '16:00'], ['closed' => true]],
    'cerrado dos veces' => [['closed' => true], ['closed' => true]],
    'franjas solapadas' => [['closed' => false, 'opens_at' => '12:00', 'closes_at' => '16:00'], ['closed' => false, 'opens_at' => '15:00', 'closes_at' => '20:00']],
])->throws(QueryException::class, 'special_hours_no_overlap');

test('un día especial admite varias franjas separadas', function () {
    $restaurant = Restaurant::factory()->create();
    SpecialHour::factory()->for($restaurant)->open('11:00', '15:00')->create(['on_date' => '2026-12-24']);
    SpecialHour::factory()->for($restaurant)->open('18:00', '23:00')->create(['on_date' => '2026-12-24']);
    SpecialHour::factory()->for($restaurant)->create(['on_date' => '2026-12-25']);

    expect(SpecialHour::query()->count())->toBe(3);
});

/*
| Horarios: las 24:00 no son una hora. PostgreSQL las admite en una columna
| time, pero ningún reloj las marca: cerrar a medianoche se escribe 00:00.
*/

test('ninguna hora del horario semanal es las 24:00', function (array $slot) {
    OpeningHour::factory()->create($slot);
})->with([
    'cierra a las 24:00' => [['opens_at' => '18:00', 'closes_at' => '24:00']],
    'abre a las 24:00' => [['opens_at' => '24:00', 'closes_at' => '02:00']],
])->throws(QueryException::class, 'opening_hours_times_below_24');

test('ninguna hora de un horario especial es las 24:00', function (string $opensAt, string $closesAt) {
    SpecialHour::factory()->open($opensAt, $closesAt)->create();
})->with([
    'cierra a las 24:00' => ['18:00', '24:00'],
    'abre a las 24:00' => ['24:00', '02:00'],
])->throws(QueryException::class, 'special_hours_times_below_24');

test('cerrar a medianoche se escribe 00:00, y el último minuto del día vale', function () {
    $restaurant = Restaurant::factory()->create();
    OpeningHour::factory()->for($restaurant)->create(['weekday' => 1, 'opens_at' => '18:00', 'closes_at' => '00:00']);
    OpeningHour::factory()->for($restaurant)->create(['weekday' => 2, 'opens_at' => '18:00', 'closes_at' => '23:59']);
    SpecialHour::factory()->for($restaurant)->open('18:00', '00:00')->create(['on_date' => '2026-12-24']);
    SpecialHour::factory()->for($restaurant)->open('18:00', '23:59')->create(['on_date' => '2026-12-25']);

    expect(OpeningHour::query()->count())->toBe(2)
        ->and(SpecialHour::query()->count())->toBe(2);
});

test('restaurant_claims tiene índices para restaurant_id y reviewed_by', function () {
    // Índices propios de cada columna: el único parcial de pendientes no sirve
    // para las FK porque solo cubre las filas en estado pending.
    $indexed = collect(Schema::getIndexes('restaurant_claims'))
        ->map(fn (array $index) => implode(',', $index['columns']))
        ->all();

    expect($indexed)->toContain('restaurant_id', 'reviewed_by');
});
