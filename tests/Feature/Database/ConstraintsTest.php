<?php

/*
| Restricciones del esquema. En PostgreSQL una violación aborta la transacción
| de RefreshDatabase, así que cada prueba provoca una sola y al final.
*/

use App\Models\Category;
use App\Models\DeliveryZone;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Neighborhood;
use App\Models\OpeningHour;
use App\Models\OptionGroup;
use App\Models\OrderIntent;
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

test('el WhatsApp son solo dígitos con indicativo', function () {
    Restaurant::factory()->create(['whatsapp' => '+573000000000']);
})->throws(QueryException::class, 'restaurants_whatsapp_format');

test('el estado solo admite los valores del enum', function () {
    DB::table('restaurants')->where('id', Restaurant::factory()->create()->id)->update(['status' => 'publicado']);
})->throws(QueryException::class, 'restaurants_status_check');

test('la ubicación es obligatoria', function () {
    Restaurant::factory()->create(['location' => null]);
})->throws(QueryException::class, 'location');

test('no se borra una categoría con restaurantes', function () {
    $category = Category::factory()->create();
    Restaurant::factory()->for($category)->create();

    $category->delete();
})->throws(QueryException::class, 'restaurants_category_id_foreign');

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

    $intent->user?->delete();

    expect($intent->fresh()?->user_id)->toBeNull();
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
