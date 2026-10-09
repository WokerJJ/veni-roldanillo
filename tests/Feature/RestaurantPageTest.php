<?php

use App\Enums\Locale;
use App\Enums\PaymentMethod;
use App\Enums\RestaurantRole;
use App\Http\Resources\RestaurantProfile;
use App\Models\Category;
use App\Models\DeliveryZone;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Neighborhood;
use App\Models\OpeningHour;
use App\Models\Option;
use App\Models\OptionGroup;
use App\Models\Restaurant;
use App\Models\SpecialHour;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use Symfony\Component\HttpFoundation\Response;

/*
| GET /restaurants/{slug} (#13, ADR 0018): la ficha pública de un restaurante.
| Lleva solo lo que cualquiera puede ver (lista blanca), una ficha oculta
| responde 404 a quien no es del restaurante ni administra, y el título y la
| descripción del documento salen en el HTML, en el idioma de la petición.
|
| Los helpers de un archivo de prueba son funciones globales: llevan el nombre
| del archivo como prefijo para no chocar con los de otro.
*/

uses(RefreshDatabase::class);

/*
| Una ficha de ejemplo, la misma para los dos lados: aquí se compara con la
| prop que manda el servidor, y de ella parte la ficha de las pruebas de la
| página (resources/js/testing/restaurants.ts), como el contrato del mapa
| (ADR 0017 y 0018).
*/
const RESTAURANT_PROFILE_CONTRACT = 'tests/contracts/restaurant.profile.json';

beforeEach(function () {
    // Las pruebas no dependen de que existan los assets compilados de Vite.
    $this->withoutVite();
});

/**
 * La prop `restaurant` de la página.
 *
 * @param  TestResponse<Response>  $response
 * @return array<string, mixed>
 */
function restaurantPageProfile(TestResponse $response): array
{
    $response->assertOk()->assertInertia(fn (Assert $page) => $page->component('Restaurants/Show'));

    return $response->inertiaProps('restaurant');
}

/** Un restaurante con todo lo que la ficha muestra. */
function restaurantPageComplete(): Restaurant
{
    $restaurant = Restaurant::factory()->claimed()->create([
        'slug' => 'la-ceiba',
        'name' => 'Restaurante de Prueba La Ceiba (ficticio)',
        'description_es' => 'Sancocho de prueba en fogón de leña.',
        'description_en' => 'Test sancocho cooked over a wood fire.',
        'address' => 'Calle de Prueba # 1-23',
        'reference' => 'Frente al parque de prueba',
        'phone' => '6020000000',
        'whatsapp' => '570009998877',
        'price_level' => 2,
        'delivery' => true,
        'delivery_notes_es' => 'Domicilios hasta las 9 de la noche.',
        'delivery_notes_en' => 'Delivery until 9 PM.',
        'payment_methods' => [PaymentMethod::Cash, PaymentMethod::Nequi],
    ]);

    $restaurant->categories()->attach(Category::factory()->create([
        'slug' => 'comida-tipica', 'name_es' => 'Comida típica', 'name_en' => 'Traditional food',
    ]));
    OpeningHour::factory()->for($restaurant)->create(['weekday' => 1, 'opens_at' => '11:00', 'closes_at' => '15:00']);
    SpecialHour::factory()->for($restaurant)->create(['on_date' => now()->toDateString(), 'note_es' => 'Festivo de prueba', 'note_en' => 'Test holiday']);
    DeliveryZone::factory()->for($restaurant)->create([
        'neighborhood_id' => Neighborhood::factory()->create(['name' => 'Barrio El Ensayo (ficticio)']),
        'fee' => 3000,
    ]);

    $section = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Platos fuertes (prueba)', 'name_en' => 'Main dishes (test)', 'position' => 0]);
    Dish::factory()->for($section)->create([
        'name_es' => 'Sancocho de prueba', 'name_en' => 'Test sancocho',
        'description_es' => 'Con arroz y aguacate.', 'description_en' => 'With rice and avocado.',
        'price' => 18000, 'position' => 0,
    ]);

    return $restaurant;
}

test('la ficha pinta la página Restaurants/Show con el restaurante de esa dirección', function () {
    Restaurant::factory()->create(['slug' => 'el-guadual']);
    restaurantPageComplete();

    $profile = restaurantPageProfile($this->get('/restaurants/la-ceiba'));

    expect($profile['slug'])->toBe('la-ceiba')
        ->and($profile['name'])->toBe('Restaurante de Prueba La Ceiba (ficticio)');
});

test('la dirección de la ficha es la misma que arma el frontend', function () {
    // El frontend no conoce las rutas de Laravel: repite el literal.
    expect(route('restaurants.show', ['slug' => 'la-ceiba'], absolute: false))->toBe('/restaurants/la-ceiba')
        ->and(File::get(resource_path('js/restaurants/links.ts')))->toContain('`/restaurants/${');
});

describe('quién la ve', function () {
    test('las publicadas, cualquiera: sin reclamar y reclamadas, sin sesión', function () {
        Restaurant::factory()->create(['slug' => 'sin-reclamar']);
        Restaurant::factory()->claimed()->create(['slug' => 'reclamado']);

        expect(restaurantPageProfile($this->get('/restaurants/sin-reclamar')))->toMatchArray(['unverified' => true, 'hidden' => false])
            ->and(restaurantPageProfile($this->get('/restaurants/reclamado')))->toMatchArray(['unverified' => false, 'hidden' => false]);
    });

    test('una oculta responde 404 al público, igual que una que no existe', function () {
        Restaurant::factory()->hidden()->create(['slug' => 'oculto', 'name' => 'Restaurante Oculto (ficticio)']);

        $hidden = $this->get('/restaurants/oculto')->assertNotFound();
        $missing = $this->get('/restaurants/no-existe')->assertNotFound();

        // Ni el código ni la página dicen que existe.
        expect($hidden->getContent())->not->toContain('Restaurante Oculto')
            ->and(strip_tags((string) $hidden->getContent()))->toBe(strip_tags((string) $missing->getContent()));
    });

    test('una oculta tampoco la ve alguien con sesión que no es del restaurante', function () {
        Restaurant::factory()->hidden()->create(['slug' => 'oculto']);
        $other = Restaurant::factory()->create();
        $stranger = User::factory()->create();
        $other->members()->attach($stranger, ['role' => RestaurantRole::Owner->value]);

        $this->actingAs($stranger)->get('/restaurants/oculto')->assertNotFound();
    });

    test('una oculta la ven el administrador y la gente del restaurante, y la página se lo dice', function (string $who) {
        $restaurant = Restaurant::factory()->hidden()->create(['slug' => 'oculto']);
        $user = $who === 'admin' ? User::factory()->admin()->create() : User::factory()->create();

        if ($who !== 'admin') {
            $restaurant->members()->attach($user, ['role' => $who]);
        }

        expect(restaurantPageProfile($this->actingAs($user)->get('/restaurants/oculto')))->toMatchArray(['slug' => 'oculto', 'hidden' => true]);
    })->with(['admin', RestaurantRole::Owner->value, RestaurantRole::Staff->value]);

    test('lo que no tiene forma de slug es un 404 que no consulta la base', function (string $path) {
        DB::enableQueryLog();

        $this->get($path)->assertNotFound();

        expect(DB::getQueryLog())->toBe([]);
    })->with([
        'mayúsculas' => ['/restaurants/La-Ceiba'],
        'un id' => ['/restaurants/-1'],
        'con espacios' => ['/restaurants/la%20ceiba'],
        'una ruta más larga' => ['/restaurants/la-ceiba/menu'],
    ]);
});

describe('lista blanca', function () {
    test('lleva solo los campos públicos de la ficha', function () {
        $restaurant = restaurantPageComplete();
        $owner = User::factory()->create(['name' => 'Dueña Privada', 'email' => 'duena-privada@example.test']);
        $restaurant->members()->attach($owner, ['role' => RestaurantRole::Owner->value]);

        $response = $this->get('/restaurants/la-ceiba');
        $profile = restaurantPageProfile($response);

        // Además de lo que comparten todas las páginas, solo estas dos props.
        expect(array_values(array_diff(array_keys($response->inertiaProps()), array_keys($this->get('/')->inertiaProps()))))->toBe(['restaurant', 'meta'])
            ->and(array_keys($profile))->toBe([
                'slug', 'name', 'description', 'categories', 'fictitious', 'hidden', 'unverified', 'updated_on',
                'price_level', 'address', 'reference', 'phone', 'whatsapp', 'payment_methods', 'delivery',
                'hours', 'special_hours', 'menu',
            ])
            ->and(array_keys($profile['categories'][0]))->toBe(['slug', 'name'])
            ->and(array_keys($profile['delivery']))->toBe(['available', 'notes', 'zones'])
            ->and(array_keys($profile['delivery']['zones'][0]))->toBe(['neighborhood', 'fee'])
            ->and(array_keys($profile['hours'][0]))->toBe(['weekday', 'opens', 'closes'])
            ->and(array_keys($profile['special_hours'][0]))->toBe(['date', 'closed', 'opens', 'closes', 'note'])
            ->and(array_keys($profile['menu'][0]))->toBe(['name', 'dishes'])
            ->and(array_keys($profile['menu'][0]['dishes'][0]))->toBe(['name', 'description', 'price', 'sold_out_until']);
    });

    test('manda la ficha que dice el contrato del que parten las pruebas de la página', function () {
        // Actualizada el lunes 5 de octubre de 2026.
        $this->travelTo('2026-10-05 10:00:00');

        $restaurant = Restaurant::factory()->claimed()->create([
            'slug' => 'prueba-la-ceiba',
            'name' => 'Restaurante de Prueba La Ceiba (ficticio)',
            'description_es' => 'Ficha de ejemplo para desarrollo. No corresponde a un negocio real.',
            'address' => 'Calle de Prueba # 1-23',
            'reference' => 'Dirección inventada',
            'phone' => '6020000000',
            'whatsapp' => '570009998877',
            'price_level' => 2,
            'delivery' => true,
            'delivery_notes_es' => 'Domicilios hasta las 9 de la noche.',
            'payment_methods' => [PaymentMethod::Cash, PaymentMethod::Nequi],
        ]);
        $restaurant->categories()->attach(Category::factory()->create(['slug' => 'comida-tipica', 'name_es' => 'Comida típica']));

        foreach (range(0, 6) as $weekday) {
            OpeningHour::factory()->for($restaurant)->create(['weekday' => $weekday, 'opens_at' => '11:00', 'closes_at' => '15:00']);
        }

        SpecialHour::factory()->for($restaurant)->create(['on_date' => '2026-10-12', 'note_es' => 'Festivo de prueba']);
        SpecialHour::factory()->for($restaurant)->open('17:00', '21:00')->create(['on_date' => '2026-10-14', 'note_es' => null, 'note_en' => null]);
        DeliveryZone::factory()->for($restaurant)->create([
            'neighborhood_id' => Neighborhood::factory()->create(['name' => 'Barrio Los Guayacanes (ficticio)']),
            'fee' => 3000,
        ]);
        DeliveryZone::factory()->for($restaurant)->create([
            'neighborhood_id' => Neighborhood::factory()->create(['name' => 'Barrio El Mirador de Prueba (ficticio)']),
            'fee' => 2500,
        ]);

        $mains = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Platos fuertes (prueba)', 'position' => 0]);
        $drinks = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Bebidas (prueba)', 'position' => 1]);
        Dish::factory()->for($mains)->create(['name_es' => 'Sancocho de prueba', 'description_es' => 'Con arroz y aguacate.', 'price' => 18500, 'position' => 0]);
        Dish::factory()->for($mains)->create(['name_es' => 'Bandeja de prueba', 'description_es' => null, 'description_en' => null, 'price' => 22000, 'sold_out_until' => '2026-10-07', 'position' => 1]);
        Dish::factory()->for($drinks)->create(['name_es' => 'Jugo de prueba', 'description_es' => 'En agua o en leche.', 'price' => 4000, 'position' => 0]);

        // Miércoles 7: los horarios especiales del contrato caen en la ventana.
        $this->travelTo('2026-10-07 12:30:00');

        $contract = json_decode((string) file_get_contents(base_path(RESTAURANT_PROFILE_CONTRACT)), true, flags: JSON_THROW_ON_ERROR);

        // Idénticos: las mismas claves, en el mismo orden y con los mismos tipos.
        expect(restaurantPageProfile($this->get('/restaurants/prueba-la-ceiba')))->toBe($contract);
    });

    test('no lleva a los dueños, ids, el plan, la ubicación ni fechas internas', function () {
        $restaurant = restaurantPageComplete();
        $owner = User::factory()->create(['name' => 'Dueña Privada', 'email' => 'duena-privada@example.test']);
        $restaurant->members()->attach($owner, ['role' => RestaurantRole::Owner->value]);

        $response = $this->get('/restaurants/la-ceiba')->assertOk();
        $props = json_encode([$response->inertiaProps('restaurant'), $response->inertiaProps('meta')], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);

        expect($props)
            ->not->toContain('Dueña Privada')
            ->not->toContain('duena-privada')
            ->not->toContain('"id"')
            ->not->toContain('_id"')
            ->not->toContain('status')
            ->not->toContain('plan')
            ->not->toContain('location')
            ->not->toContain('verified_at')
            ->not->toContain('created_at')
            ->not->toContain('updated_at')
            ->not->toContain('photo_path');
    });

    test('trae el contacto del negocio, los medios de pago y el nivel de precios', function () {
        restaurantPageComplete();

        expect(restaurantPageProfile($this->get('/restaurants/la-ceiba')))->toMatchArray([
            'address' => 'Calle de Prueba # 1-23',
            'reference' => 'Frente al parque de prueba',
            'phone' => '6020000000',
            'whatsapp' => '570009998877',
            'payment_methods' => ['cash', 'nequi'],
            'price_level' => 2,
            'fictitious' => true,
        ]);
    });

    test('lo que el restaurante no cargó llega vacío, no inventado', function () {
        Restaurant::factory()->create([
            'slug' => 'recien-creado', 'description_es' => null, 'description_en' => null, 'address' => null,
            'reference' => null, 'phone' => null, 'whatsapp' => null, 'price_level' => null,
            'delivery' => false, 'payment_methods' => [],
        ]);

        expect(restaurantPageProfile($this->get('/restaurants/recien-creado')))->toMatchArray([
            'description' => null,
            'categories' => [],
            'price_level' => null,
            'address' => null,
            'reference' => null,
            'phone' => null,
            'whatsapp' => null,
            'payment_methods' => [],
            'delivery' => ['available' => false, 'notes' => null, 'zones' => []],
            'hours' => [],
            'special_hours' => [],
            'menu' => [],
        ]);
    });

    test('dice cuándo se actualizó, con el día de Colombia', function () {
        // 20:00 del 7 de octubre en Colombia: en UTC ya es 8.
        $this->travelTo('2026-10-08 01:00:00 UTC');
        Restaurant::factory()->create(['slug' => 'la-ceiba']);

        expect(restaurantPageProfile($this->get('/restaurants/la-ceiba'))['updated_on'])->toBe('2026-10-07');
    });
});

describe('idioma', function () {
    test('los textos del restaurante salen en el idioma de la petición', function (string $locale, array $expected) {
        restaurantPageComplete();

        $profile = restaurantPageProfile($this->get('/restaurants/la-ceiba?lang='.$locale));

        expect([
            $profile['description'],
            $profile['categories'][0]['name'],
            $profile['delivery']['notes'],
            $profile['special_hours'][0]['note'],
            $profile['menu'][0]['name'],
            $profile['menu'][0]['dishes'][0]['name'],
            $profile['menu'][0]['dishes'][0]['description'],
        ])->toBe($expected);
    })->with([
        'español' => ['es', [
            'Sancocho de prueba en fogón de leña.', 'Comida típica', 'Domicilios hasta las 9 de la noche.',
            'Festivo de prueba', 'Platos fuertes (prueba)', 'Sancocho de prueba', 'Con arroz y aguacate.',
        ]],
        'inglés' => ['en', [
            'Test sancocho cooked over a wood fire.', 'Traditional food', 'Delivery until 9 PM.',
            'Test holiday', 'Main dishes (test)', 'Test sancocho', 'With rice and avocado.',
        ]],
    ]);

    test('lo que no tiene inglés sale en español antes que vacío', function () {
        $restaurant = Restaurant::factory()->create(['slug' => 'solo-espanol', 'description_es' => 'Solo en español.', 'description_en' => null]);
        $section = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Bebidas (prueba)', 'name_en' => null]);
        Dish::factory()->for($section)->create(['name_es' => 'Jugo de prueba', 'name_en' => '  ']);

        $profile = restaurantPageProfile($this->get('/restaurants/solo-espanol?lang=en'));

        expect($profile['description'])->toBe('Solo en español.')
            ->and($profile['menu'][0]['name'])->toBe('Bebidas (prueba)')
            ->and($profile['menu'][0]['dishes'][0]['name'])->toBe('Jugo de prueba');
    });
});

describe('horario', function () {
    test('trae el horario semanal en orden, con las horas al minuto', function () {
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
        OpeningHour::factory()->for($restaurant)->create(['weekday' => 5, 'opens_at' => '18:00', 'closes_at' => '02:00']);
        OpeningHour::factory()->for($restaurant)->create(['weekday' => 1, 'opens_at' => '18:00', 'closes_at' => '22:00']);
        OpeningHour::factory()->for($restaurant)->create(['weekday' => 1, 'opens_at' => '11:00', 'closes_at' => '15:00']);

        expect(restaurantPageProfile($this->get('/restaurants/la-ceiba'))['hours'])->toBe([
            ['weekday' => 1, 'opens' => '11:00', 'closes' => '15:00'],
            ['weekday' => 1, 'opens' => '18:00', 'closes' => '22:00'],
            ['weekday' => 5, 'opens' => '18:00', 'closes' => '02:00'],
        ]);
    });

    test('trae los horarios especiales de la misma ventana que el mapa, con su nota', function () {
        // Miércoles 7 de octubre de 2026 al mediodía, hora de Colombia.
        $this->travelTo('2026-10-07 12:00:00');
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
        SpecialHour::factory()->for($restaurant)->create(['on_date' => '2026-10-05']);
        SpecialHour::factory()->for($restaurant)->open('20:00', '03:00')->create(['on_date' => '2026-10-06', 'note_es' => 'Noche de prueba']);
        SpecialHour::factory()->for($restaurant)->create(['on_date' => '2026-10-12', 'note_es' => 'Festivo de prueba']);
        SpecialHour::factory()->for($restaurant)->open('17:00', '21:00')->create(['on_date' => '2026-10-14', 'note_es' => null, 'note_en' => null]);
        SpecialHour::factory()->for($restaurant)->create(['on_date' => '2026-10-15']);

        $profile = restaurantPageProfile($this->get('/restaurants/la-ceiba'));
        $onTheMap = $this->get('/api/restaurants.geojson')->json('features.0.properties.special_hours');

        expect($profile['special_hours'])->toBe([
            ['date' => '2026-10-06', 'closed' => false, 'opens' => '20:00', 'closes' => '03:00', 'note' => 'Noche de prueba'],
            ['date' => '2026-10-12', 'closed' => true, 'opens' => null, 'closes' => null, 'note' => 'Festivo de prueba'],
            ['date' => '2026-10-14', 'closed' => false, 'opens' => '17:00', 'closes' => '21:00', 'note' => null],
        ])
            // El mismo horario en los dos lados: el estado que se lee es el mismo.
            ->and(array_map(fn (array $day) => array_diff_key($day, ['note' => true]), $profile['special_hours']))->toBe($onTheMap);
    });

    test('los horarios de otro restaurante no se cuelan', function () {
        Restaurant::factory()->create(['slug' => 'la-ceiba']);
        $other = Restaurant::factory()->create();
        OpeningHour::factory()->for($other)->create();
        SpecialHour::factory()->for($other)->create(['on_date' => now()->toDateString()]);

        expect(restaurantPageProfile($this->get('/restaurants/la-ceiba')))->toMatchArray(['hours' => [], 'special_hours' => []]);
    });
});

describe('menú', function () {
    test('va por secciones y platos en el orden del restaurante, con el precio en pesos', function () {
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
        $drinks = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Bebidas (prueba)', 'position' => 1]);
        $mains = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Platos fuertes (prueba)', 'position' => 0]);
        Dish::factory()->for($mains)->create(['name_es' => 'Segundo', 'price' => 22000, 'position' => 1]);
        Dish::factory()->for($mains)->create(['name_es' => 'Primero', 'price' => 18500, 'position' => 0]);
        // Con la misma posición desempata el id: el orden no cambia entre cargas.
        Dish::factory()->for($drinks)->create(['name_es' => 'Jugo', 'description_es' => null, 'price' => 4000, 'position' => 3]);
        Dish::factory()->for($drinks)->create(['name_es' => 'Gaseosa', 'description_es' => null, 'price' => 3500, 'position' => 3]);

        expect(restaurantPageProfile($this->get('/restaurants/la-ceiba'))['menu'])->toBe([
            ['name' => 'Platos fuertes (prueba)', 'dishes' => [
                ['name' => 'Primero', 'description' => 'Descripción de ejemplo.', 'price' => 18500, 'sold_out_until' => null],
                ['name' => 'Segundo', 'description' => 'Descripción de ejemplo.', 'price' => 22000, 'sold_out_until' => null],
            ]],
            ['name' => 'Bebidas (prueba)', 'dishes' => [
                ['name' => 'Jugo', 'description' => null, 'price' => 4000, 'sold_out_until' => null],
                ['name' => 'Gaseosa', 'description' => null, 'price' => 3500, 'sold_out_until' => null],
            ]],
        ]);
    });

    test('un plato que el dueño sacó del menú no sale, y una sección sin platos tampoco', function () {
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
        $mains = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Platos fuertes (prueba)', 'position' => 0]);
        $desserts = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Postres (prueba)', 'position' => 1]);
        MenuSection::factory()->for($restaurant)->create(['name_es' => 'Entradas (prueba)', 'position' => 2]);
        Dish::factory()->for($mains)->create(['name_es' => 'A la vista']);
        Dish::factory()->for($mains)->create(['name_es' => 'Fuera del menú', 'available' => false]);
        Dish::factory()->for($desserts)->create(['name_es' => 'Postre retirado', 'available' => false]);

        $response = $this->get('/restaurants/la-ceiba');
        $menu = restaurantPageProfile($response)['menu'];

        expect(array_column($menu, 'name'))->toBe(['Platos fuertes (prueba)'])
            ->and(array_column($menu[0]['dishes'], 'name'))->toBe(['A la vista'])
            ->and(json_encode($response->inertiaProps('restaurant'), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE))->not->toContain('Fuera del menú')->not->toContain('Postre retirado');
    });

    test('la lista blanca no publica un plato fuera del menú aunque llegue cargado', function () {
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
        $mains = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Platos fuertes (prueba)', 'position' => 0]);
        $desserts = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Postres (prueba)', 'position' => 1]);
        Dish::factory()->for($mains)->create(['name_es' => 'A la vista']);
        Dish::factory()->for($mains)->create(['name_es' => 'Fuera del menú', 'available' => false]);
        Dish::factory()->for($desserts)->create(['name_es' => 'Postre retirado', 'available' => false]);

        // Todo cargado, sin el filtro de quien arma la consulta.
        $restaurant->load(['categories', 'openingHours', 'specialHours', 'menuSections.dishes', 'deliveryZones.neighborhood']);

        $menu = (new RestaurantProfile($restaurant, Locale::Es))->toArray(request())['menu'];

        expect(array_column($menu, 'name'))->toBe(['Platos fuertes (prueba)'])
            ->and(array_column($menu[0]['dishes'], 'name'))->toBe(['A la vista']);
    });

    test('«agotado hoy» viaja como la fecha hasta la que vale: si es hoy lo dice el dispositivo', function () {
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
        $section = MenuSection::factory()->for($restaurant)->create();
        Dish::factory()->for($section)->create(['name_es' => 'Se agotó ayer', 'sold_out_until' => '2026-10-06', 'position' => 0]);
        Dish::factory()->for($section)->create(['name_es' => 'Agotado hoy', 'sold_out_until' => '2026-10-07', 'position' => 1]);
        Dish::factory()->for($section)->create(['name_es' => 'Agotado hasta mañana', 'sold_out_until' => '2026-10-08', 'position' => 2]);
        Dish::factory()->for($section)->create(['name_es' => 'Hay', 'position' => 3]);

        $dishesAt = function (string $moment): array {
            $this->travelTo($moment);

            return restaurantPageProfile($this->get('/restaurants/la-ceiba'))['menu'][0]['dishes'];
        };

        $tonight = $dishesAt('2026-10-07 20:00:00');

        expect(array_column($tonight, 'sold_out_until', 'name'))->toBe([
            'Se agotó ayer' => '2026-10-06',
            'Agotado hoy' => '2026-10-07',
            'Agotado hasta mañana' => '2026-10-08',
            'Hay' => null,
        ])
            // Lo mismo a cualquier hora: una ficha que queda abierta de un día
            // para otro no se queda con el «agotado» de la víspera.
            ->and($dishesAt('2026-10-08 08:00:00'))->toBe($tonight);
    });

    test('las opciones y adiciones de un plato no viajan: son del pedido', function () {
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
        $dish = Dish::factory()->for(MenuSection::factory()->for($restaurant))->create();
        Option::factory()->for(OptionGroup::factory()->for($dish)->create(['name_es' => 'Proteína interna']))->create(['name_es' => 'Opción interna']);

        expect(json_encode($this->get('/restaurants/la-ceiba')->inertiaProps('restaurant'), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE))
            ->not->toContain('Proteína interna')
            ->not->toContain('Opción interna');
    });

    test('el menú de otro restaurante no se cuela', function () {
        Restaurant::factory()->create(['slug' => 'la-ceiba']);
        Dish::factory()->create(['name_es' => 'Plato ajeno']);

        expect(restaurantPageProfile($this->get('/restaurants/la-ceiba'))['menu'])->toBe([]);
    });
});

describe('domicilios', function () {
    test('lleva a los barrios de sus zonas, con el costo, en orden alfabético', function () {
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba', 'delivery' => true]);
        DeliveryZone::factory()->for($restaurant)->create(['neighborhood_id' => Neighborhood::factory()->create(['name' => 'Barrio Zeta (ficticio)']), 'fee' => 4000]);
        DeliveryZone::factory()->for($restaurant)->create(['neighborhood_id' => Neighborhood::factory()->create(['name' => 'Barrio Alfa (ficticio)']), 'fee' => 2500]);
        // La zona de otro restaurante no es de este.
        DeliveryZone::factory()->create(['fee' => 9000]);

        expect(restaurantPageProfile($this->get('/restaurants/la-ceiba'))['delivery']['zones'])->toBe([
            ['neighborhood' => 'Barrio Alfa (ficticio)', 'fee' => 2500],
            ['neighborhood' => 'Barrio Zeta (ficticio)', 'fee' => 4000],
        ]);
    });

    test('las zonas mandan sobre la casilla, como en el mapa', function (bool $checkbox, bool $withZone, bool $delivers) {
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba', 'delivery' => $checkbox]);

        if ($withZone) {
            DeliveryZone::factory()->for($restaurant)->create();
        }

        $onTheMap = fn () => $this->get('/api/restaurants.geojson')->json('features.0.properties.delivery');

        expect(restaurantPageProfile($this->get('/restaurants/la-ceiba'))['delivery']['available'])->toBe($delivers)
            ->and($onTheMap())->toBe($delivers);
    })->with([
        'con zonas y sin casilla' => [false, true, true],
        'con casilla y sin zonas' => [true, false, true],
        'sin nada' => [false, false, false],
    ]);
});

test('hace las mismas consultas con un menú corto que con uno largo', function () {
    $seed = function (string $slug, int $size): void {
        $restaurant = Restaurant::factory()->create(['slug' => $slug]);
        $restaurant->categories()->attach(Category::factory()->count($size)->create());
        SpecialHour::factory()->for($restaurant)->create(['on_date' => now()->toDateString()]);

        foreach (range(1, $size) as $i) {
            OpeningHour::factory()->for($restaurant)->create(['weekday' => $i % 7, 'opens_at' => sprintf('%02d:00', $i), 'closes_at' => sprintf('%02d:30', $i)]);
            DeliveryZone::factory()->for($restaurant)->create();
            Dish::factory()->count($size)->for(MenuSection::factory()->for($restaurant))->create();
        }
    };
    $queries = function (string $slug): int {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->get("/restaurants/{$slug}")->assertOk();
        DB::disableQueryLog();

        return count(DB::getQueryLog());
    };

    $seed('corto', 1);
    $seed('largo', 6);

    // El restaurante y una por tabla: categorías, horario semanal, horarios
    // especiales, secciones, platos, zonas de domicilio y sus barrios.
    expect($queries('corto'))->toBe(8)
        ->and($queries('largo'))->toBe(8)
        ->and(restaurantPageProfile($this->get('/restaurants/largo'))['menu'])->toHaveCount(6);
});

test('una oculta no llega a consultar su contenido', function () {
    $restaurant = Restaurant::factory()->hidden()->create(['slug' => 'oculto']);
    Dish::factory()->for(MenuSection::factory()->for($restaurant))->create();
    DB::enableQueryLog();

    $this->get('/restaurants/oculto')->assertNotFound();

    expect(DB::getQueryLog())->toHaveCount(1);
});

describe('título y descripción del documento', function () {
    test('el HTML trae el título del restaurante y su descripción, en el idioma de la petición', function (string $locale, string $description) {
        restaurantPageComplete();

        $this->get('/restaurants/la-ceiba?lang='.$locale)
            ->assertOk()
            ->assertSee('<html lang="'.$locale.'"', false)
            ->assertSee('<title>Restaurante de Prueba La Ceiba (ficticio) · '.e(config('app.name')).'</title>', false)
            ->assertSee('<meta name="description" content="'.e($description).'">', false);
    })->with([
        'español' => ['es', 'Sancocho de prueba en fogón de leña.'],
        'inglés' => ['en', 'Test sancocho cooked over a wood fire.'],
    ]);

    test('la página recibe los mismos, para mantenerlos al navegar sin recargar', function () {
        restaurantPageComplete();

        expect($this->get('/restaurants/la-ceiba')->inertiaProps('meta'))->toBe([
            'title' => 'Restaurante de Prueba La Ceiba (ficticio)',
            'description' => 'Sancocho de prueba en fogón de leña.',
        ]);
    });

    test('sin descripción, la arma con el nombre en el idioma de la petición', function (string $locale) {
        Restaurant::factory()->create(['slug' => 'sin-descripcion', 'name' => 'El Guadual (ficticio)', 'description_es' => null, 'description_en' => null]);
        $expected = trans('restaurant.meta_description', ['name' => 'El Guadual (ficticio)'], $locale);

        // Si faltara la traducción, trans() devolvería la clave.
        expect($expected)->toContain('El Guadual (ficticio)')
            ->and($this->get('/restaurants/sin-descripcion?lang='.$locale)->inertiaProps('meta.description'))->toBe($expected);
    })->with(['es', 'en']);

    test('una descripción larga se recorta sin partir palabras ni dejar saltos de línea', function () {
        $long = 'Sancocho de prueba.'.PHP_EOL.PHP_EOL.str_repeat('Almuerzo casero de prueba con sopa y seco. ', 10);
        Restaurant::factory()->create(['slug' => 'descripcion-larga', 'description_es' => $long]);

        $description = $this->get('/restaurants/descripcion-larga')->inertiaProps('meta.description');
        $kept = mb_substr($description, 0, -1);

        expect(mb_strlen($description))->toBeLessThanOrEqual(156)
            ->and($description)->toStartWith('Sancocho de prueba. Almuerzo casero')
            ->and($description)->toEndWith('…')
            ->and($description)->not->toContain(PHP_EOL)
            // Lo que queda termina en una palabra entera del texto.
            ->and(Str::squish($long))->toStartWith($kept.' ');
    });

    test('un nombre con caracteres de HTML sale escapado', function () {
        Restaurant::factory()->create(['slug' => 'con-html', 'name' => 'Sabor & <b>Fogón</b> (ficticio)', 'description_es' => 'Prueba de "comillas" & <script>.']);

        $this->get('/restaurants/con-html')
            ->assertOk()
            ->assertSee('<title>Sabor &amp; &lt;b&gt;Fogón&lt;/b&gt; (ficticio) · ', false)
            ->assertSee('content="Prueba de &quot;comillas&quot; &amp; &lt;script&gt;."', false)
            ->assertDontSee('<b>Fogón</b>', false);
    });

    test('las demás páginas siguen con el título y la descripción generales', function () {
        $this->get('/')
            ->assertOk()
            ->assertSee('<title>'.e(config('app.name')).'</title>', false)
            ->assertSee('<meta name="description" content="'.e(trans('meta.description', [], 'es')).'">', false);
    });
});

test('lleva las cabeceras de seguridad y la política de contenido pública', function () {
    Restaurant::factory()->create(['slug' => 'la-ceiba']);

    $response = $this->get('/restaurants/la-ceiba')->assertOk();

    expect($response->headers->get('X-Content-Type-Options'))->toBe('nosniff')
        ->and((string) $response->headers->get('Content-Security-Policy'))->toContain("default-src 'self'")->toContain("frame-ancestors 'none'")
        // El HTML depende del idioma y de la sesión: ninguna caché compartida lo guarda.
        ->and((string) $response->headers->get('Cache-Control'))->not->toContain('public');
});
