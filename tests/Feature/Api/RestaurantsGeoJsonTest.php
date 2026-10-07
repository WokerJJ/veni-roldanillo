<?php

use App\Models\Category;
use App\Models\DeliveryZone;
use App\Models\OpeningHour;
use App\Models\Restaurant;
use App\Models\SpecialHour;
use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Support\GeoPoint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;

/*
| GET /api/restaurants.geojson (#9): los restaurantes publicados como capa del
| mapa. Es público y se guarda en cachés: solo lleva lo que cualquiera puede
| ver en el mapa (lista blanca), nunca una ficha oculta, y la misma URL
| responde siempre lo mismo, sin mirar cookies ni el idioma del navegador.
*/

uses(RefreshDatabase::class);

const RESTAURANTS_GEOJSON = '/api/restaurants.geojson';

/**
 * @param  TestResponse<Response>  $response
 * @return list<array<string, mixed>>
 */
function geoJsonFeatures(TestResponse $response): array
{
    $body = json_decode((string) $response->getContent(), true, flags: JSON_THROW_ON_ERROR);

    expect($body)->toBeArray()->toHaveKeys(['type', 'features']);

    return $body['features'];
}

/**
 * Las propiedades del restaurante con ese slug.
 *
 * @param  TestResponse<Response>  $response
 * @return array<string, mixed>
 */
function geoJsonProperties(TestResponse $response, string $slug): array
{
    $feature = collect(geoJsonFeatures($response))->firstWhere('properties.slug', $slug);

    expect($feature)->not->toBeNull("No está «{$slug}» en la respuesta.");

    return $feature['properties'];
}

test('responde una FeatureCollection de GeoJSON', function () {
    Restaurant::factory()->create();

    $response = $this->get(RESTAURANTS_GEOJSON)->assertOk();

    expect($response->headers->get('Content-Type'))->toBe('application/geo+json')
        ->and($response->json('type'))->toBe('FeatureCollection')
        ->and($response->json('features'))->toHaveCount(1)
        ->and($response->json('features.0.type'))->toBe('Feature');
});

test('lleva las cabeceras de seguridad de toda la app', function () {
    $response = $this->get(RESTAURANTS_GEOJSON)->assertOk();

    // El navegador no adivina otro tipo de contenido para este JSON.
    expect($response->headers->get('X-Content-Type-Options'))->toBe('nosniff')
        ->and($response->headers->has('Content-Security-Policy'))->toBeTrue();
});

test('la página del mapa puede pedirlo: la CSP deja hacer fetch al mismo origen', function () {
    $csp = (string) $this->withoutVite()->get('/')->assertOk()->headers->get('Content-Security-Policy');

    expect($csp)->toMatch("/connect-src [^;]*'self'/");
});

test('sin restaurantes responde una colección vacía, no un error', function () {
    $response = $this->get(RESTAURANTS_GEOJSON)->assertOk();

    expect($response->getContent())->toBe('{"type":"FeatureCollection","features":[]}');
});

test('solo trae los restaurantes publicados: una ficha oculta nunca sale', function () {
    Restaurant::factory()->create(['slug' => 'sin-reclamar']);
    Restaurant::factory()->claimed()->create(['slug' => 'reclamado']);
    Restaurant::factory()->hidden()->create(['slug' => 'oculto', 'name' => 'Restaurante Oculto (ficticio)']);

    $response = $this->get(RESTAURANTS_GEOJSON)->assertOk();

    expect(collect(geoJsonFeatures($response))->pluck('properties.slug')->sort()->values()->all())->toBe(['reclamado', 'sin-reclamar'])
        ->and($response->getContent())->not->toContain('oculto')->not->toContain('Restaurante Oculto');
});

test('cada restaurante lleva solo los campos públicos de la lista blanca', function () {
    $owner = User::factory()->create(['email' => 'duena-privada@example.test']);
    $restaurant = Restaurant::factory()->claimed()->create([
        'slug' => 'la-ceiba',
        'address' => 'Calle Privada # 1-23',
        'reference' => 'Referencia privada',
        'phone' => '6022290000',
        'whatsapp' => '570009998877',
        'description_es' => 'Descripción que no va en el mapa',
        'delivery_notes_es' => 'Notas de domicilio que no van en el mapa',
    ]);
    $restaurant->members()->attach($owner, ['role' => 'owner']);
    $restaurant->categories()->attach(Category::factory()->create());
    OpeningHour::factory()->for($restaurant)->create();

    $response = $this->get(RESTAURANTS_GEOJSON)->assertOk();
    $feature = geoJsonFeatures($response)[0];

    expect(array_keys($feature))->toBe(['type', 'geometry', 'properties'])
        ->and(array_keys($feature['geometry']))->toBe(['type', 'coordinates'])
        ->and(array_keys($feature['properties']))->toBe(['slug', 'name', 'categories', 'delivery', 'fictitious', 'hours', 'special_hours'])
        ->and(array_keys($feature['properties']['categories'][0]))->toBe(['slug', 'name'])
        ->and(array_keys($feature['properties']['hours'][0]))->toBe(['weekday', 'opens', 'closes']);

    // Nada de contacto, dirección, dueños ni datos internos, con el nombre que sea.
    expect($response->getContent())
        ->not->toContain('570009998877')
        ->not->toContain('6022290000')
        ->not->toContain('Calle Privada')
        ->not->toContain('Referencia privada')
        ->not->toContain('duena-privada')
        ->not->toContain('Descripción que no va')
        ->not->toContain('Notas de domicilio')
        ->not->toContain('status')
        ->not->toContain('plan')
        ->not->toContain('verified_at')
        ->not->toContain('created_at')
        ->not->toContain('"id"');
});

test('la geometría es un punto con la longitud primero, como manda GeoJSON', function () {
    Restaurant::factory()->create(['location' => new GeoPoint(4.4128123456, -76.1547123456)]);

    $geometry = geoJsonFeatures($this->get(RESTAURANTS_GEOJSON))[0]['geometry'];

    // Seis decimales: unos 10 cm, de sobra para un marcador.
    expect($geometry)->toBe(['type' => 'Point', 'coordinates' => [-76.154712, 4.412812]]);
});

test('trae el nombre, si hace domicilios y si es un dato de ejemplo', function () {
    Restaurant::factory()->create(['slug' => 'con-domicilio', 'name' => 'Restaurante de Prueba La Ceiba (ficticio)', 'delivery' => true]);
    Restaurant::factory()->create(['slug' => 'sin-domicilio', 'delivery' => false]);
    Restaurant::factory()->create(['slug' => 'real', 'delivery' => false])->forceFill(['is_fictitious' => false])->save();

    $response = $this->get(RESTAURANTS_GEOJSON);

    expect(geoJsonProperties($response, 'con-domicilio'))->toMatchArray(['name' => 'Restaurante de Prueba La Ceiba (ficticio)', 'delivery' => true, 'fictitious' => true])
        ->and(geoJsonProperties($response, 'sin-domicilio'))->toMatchArray(['delivery' => false, 'fictitious' => true])
        ->and(geoJsonProperties($response, 'real'))->toMatchArray(['fictitious' => false]);
});

test('con zonas de domicilio cargadas hace domicilios aunque la casilla esté sin marcar', function () {
    $restaurant = Restaurant::factory()->create(['slug' => 'con-zonas', 'delivery' => false]);
    DeliveryZone::factory()->for($restaurant)->create();

    expect(geoJsonProperties($this->get(RESTAURANTS_GEOJSON), 'con-zonas')['delivery'])->toBeTrue();
});

describe('idioma', function () {
    beforeEach(function () {
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
        $restaurant->categories()->attach([
            Category::factory()->create(['slug' => 'comida-tipica', 'name_es' => 'Comida típica', 'name_en' => 'Traditional food', 'position' => 1])->id,
            Category::factory()->create(['slug' => 'asados', 'name_es' => 'Asados', 'name_en' => null, 'position' => 0])->id,
        ]);
    });

    test('sin parámetro, las categorías van en español y en su orden', function () {
        $response = $this->get(RESTAURANTS_GEOJSON)->assertOk();

        expect(geoJsonProperties($response, 'la-ceiba')['categories'])->toBe([
            ['slug' => 'asados', 'name' => 'Asados'],
            ['slug' => 'comida-tipica', 'name' => 'Comida típica'],
        ])->and($response->headers->get('Content-Language'))->toBe('es');
    });

    test('con ?lang=en van en inglés, y en español la que no tiene traducción', function () {
        $response = $this->get(RESTAURANTS_GEOJSON.'?lang=en')->assertOk();

        expect(geoJsonProperties($response, 'la-ceiba')['categories'])->toBe([
            ['slug' => 'asados', 'name' => 'Asados'],
            ['slug' => 'comida-tipica', 'name' => 'Traditional food'],
        ])->and($response->headers->get('Content-Language'))->toBe('en');
    });

    test('la misma URL responde lo mismo para todos: ni la cookie ni el navegador cambian el idioma', function () {
        $spanish = $this->get(RESTAURANTS_GEOJSON)->getContent();

        $response = $this->withUnencryptedCookie('locale', 'en')
            ->withHeaders(['Accept-Language' => 'en-US,en;q=0.9'])
            ->get(RESTAURANTS_GEOJSON)
            ->assertOk();

        expect($response->getContent())->toBe($spanish)
            // Sin Vary por cookie o idioma: una caché compartida guarda una copia por URL.
            ->and((string) $response->headers->get('Vary'))->not->toContain('Cookie')->not->toContain('Accept-Language');
    });

    test('los acentos van tal cual, sin escapar', function () {
        expect($this->get(RESTAURANTS_GEOJSON)->getContent())->toContain('Comida típica');
    });

    test('un idioma que la app no tiene es un error del pedido, no español en silencio', function (string $query) {
        $this->getJson(RESTAURANTS_GEOJSON.$query)
            ->assertStatus(422)
            ->assertJsonValidationErrors('lang');
    })->with(['?lang=fr', '?lang=', '?lang[]=es']);

    test('ese error sale como JSON aunque quien pide no lo diga', function () {
        $response = $this->get(RESTAURANTS_GEOJSON.'?lang=fr')->assertStatus(422);

        expect($response->headers->get('Content-Type'))->toContain('application/json');
    });
});

describe('horarios para «abierto ahora»', function () {
    test('trae el horario semanal ordenado por día y hora, sin segundos', function () {
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
        OpeningHour::factory()->for($restaurant)->create(['weekday' => 5, 'opens_at' => '18:00', 'closes_at' => '02:00']);
        OpeningHour::factory()->for($restaurant)->create(['weekday' => 1, 'opens_at' => '18:00', 'closes_at' => '22:00']);
        OpeningHour::factory()->for($restaurant)->create(['weekday' => 1, 'opens_at' => '11:00', 'closes_at' => '15:00']);

        expect(geoJsonProperties($this->get(RESTAURANTS_GEOJSON), 'la-ceiba')['hours'])->toBe([
            ['weekday' => 1, 'opens' => '11:00', 'closes' => '15:00'],
            ['weekday' => 1, 'opens' => '18:00', 'closes' => '22:00'],
            ['weekday' => 5, 'opens' => '18:00', 'closes' => '02:00'],
        ]);
    });

    test('trae los horarios especiales de ayer a siete días, y no los demás', function () {
        // Miércoles 7 de octubre de 2026 al mediodía, hora de Colombia.
        $this->travelTo('2026-10-07 12:00:00');
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
        SpecialHour::factory()->for($restaurant)->create(['on_date' => '2026-10-05']);
        // Ayer cuenta: una franja de ayer puede pasar la medianoche.
        SpecialHour::factory()->for($restaurant)->open('20:00', '03:00')->create(['on_date' => '2026-10-06']);
        SpecialHour::factory()->for($restaurant)->create(['on_date' => '2026-10-07']);
        SpecialHour::factory()->for($restaurant)->open('17:00', '21:00')->create(['on_date' => '2026-10-14']);
        SpecialHour::factory()->for($restaurant)->open('12:00', '14:00')->create(['on_date' => '2026-10-14']);
        SpecialHour::factory()->for($restaurant)->create(['on_date' => '2026-10-15']);

        expect(geoJsonProperties($this->get(RESTAURANTS_GEOJSON), 'la-ceiba')['special_hours'])->toBe([
            ['date' => '2026-10-06', 'closed' => false, 'opens' => '20:00', 'closes' => '03:00'],
            ['date' => '2026-10-07', 'closed' => true, 'opens' => null, 'closes' => null],
            ['date' => '2026-10-14', 'closed' => false, 'opens' => '12:00', 'closes' => '14:00'],
            ['date' => '2026-10-14', 'closed' => false, 'opens' => '17:00', 'closes' => '21:00'],
        ]);
    });

    test('«hoy» es el día en Colombia, no en UTC', function () {
        // 20:00 en Colombia del 7 de octubre: en UTC ya es 8. La ventana empieza el 6, no el 7.
        $this->travelTo('2026-10-08 01:00:00 UTC');
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
        SpecialHour::factory()->for($restaurant)->create(['on_date' => '2026-10-06']);
        SpecialHour::factory()->for($restaurant)->create(['on_date' => '2026-10-15']);

        expect(geoJsonProperties($this->get(RESTAURANTS_GEOJSON), 'la-ceiba')['special_hours'])->toBe([
            ['date' => '2026-10-06', 'closed' => true, 'opens' => null, 'closes' => null],
        ]);
    });

    test('no trae la nota del horario especial ni nada más de esa tabla', function () {
        $this->travelTo('2026-10-07 12:00:00');
        $restaurant = Restaurant::factory()->create();
        SpecialHour::factory()->for($restaurant)->create(['on_date' => '2026-10-07', 'note_es' => 'Nota interna del cierre']);

        $response = $this->get(RESTAURANTS_GEOJSON);

        expect(array_keys(geoJsonFeatures($response)[0]['properties']['special_hours'][0]))->toBe(['date', 'closed', 'opens', 'closes'])
            ->and($response->getContent())->not->toContain('Nota interna');
    });

    test('un restaurante sin horarios cargados lleva las listas vacías', function () {
        Restaurant::factory()->create(['slug' => 'sin-horario']);

        expect(geoJsonProperties($this->get(RESTAURANTS_GEOJSON), 'sin-horario'))->toMatchArray(['hours' => [], 'special_hours' => []]);
    });
});

describe('caché', function () {
    test('se puede guardar un minuto en cualquier caché y lleva ETag', function () {
        Restaurant::factory()->create();

        $response = $this->get(RESTAURANTS_GEOJSON)->assertOk();

        expect($response->headers->get('Cache-Control'))->toContain('public')->toContain('max-age=60')
            ->and($response->headers->get('ETag'))->toMatch('/^"[0-9a-f]+"$/');
    });

    test('no abre sesión ni manda cookies: una respuesta con Set-Cookie no se comparte', function () {
        $response = $this->get(RESTAURANTS_GEOJSON)->assertOk();

        expect($response->headers->getCookies())->toBe([]);
    });

    test('con el ETag al día responde 304 sin cuerpo', function () {
        Restaurant::factory()->create();
        $etag = $this->get(RESTAURANTS_GEOJSON)->headers->get('ETag');

        $response = $this->withHeaders(['If-None-Match' => $etag])->get(RESTAURANTS_GEOJSON)->assertStatus(304);

        expect($response->getContent())->toBe('')
            ->and($response->headers->get('ETag'))->toBe($etag);
    });

    test('el ETag cambia cuando cambian los datos y cuando cambia el idioma', function () {
        $restaurant = Restaurant::factory()->create();
        $restaurant->categories()->attach(Category::factory()->create());
        $before = $this->get(RESTAURANTS_GEOJSON)->headers->get('ETag');

        expect($this->get(RESTAURANTS_GEOJSON.'?lang=en')->headers->get('ETag'))->not->toBe($before);

        // Se oculta la ficha: quien tenía la respuesta guardada recibe la nueva, sin ella.
        $restaurant->forceFill(['status' => 'hidden'])->save();

        $after = $this->withHeaders(['If-None-Match' => $before])->get(RESTAURANTS_GEOJSON)->assertOk();

        expect($after->headers->get('ETag'))->not->toBe($before)
            ->and($after->json('features'))->toBe([]);
    });

    test('la misma respuesta no cambia de un minuto a otro: no lleva la hora ni el estado abierto', function () {
        $this->travelTo('2026-10-07 11:59:30');
        $restaurant = Restaurant::factory()->create();
        OpeningHour::factory()->for($restaurant)->create(['weekday' => 3, 'opens_at' => '12:00', 'closes_at' => '15:00']);
        $closed = $this->get(RESTAURANTS_GEOJSON)->getContent();

        // Un minuto después el restaurante ya abrió: lo calcula el dispositivo, con estos mismos datos.
        $this->travelTo('2026-10-07 12:00:30');

        expect($this->get(RESTAURANTS_GEOJSON)->getContent())->toBe($closed);
    });
});

describe('límite de peticiones', function () {
    beforeEach(function () {
        config(['trustedproxy.proxies' => ['172.18.0.1']]);
    });

    /**
     * @return TestResponse<Response>
     */
    function restaurantsGeoJsonFrom(string $clientIp): TestResponse
    {
        return test()->withServerVariables(['REMOTE_ADDR' => '172.18.0.1'])
            ->withHeaders(['X-Forwarded-For' => $clientIp])
            ->get(RESTAURANTS_GEOJSON);
    }

    test('pasado el límite por minuto responde 429 con Retry-After, y al minuto vuelve', function () {
        for ($i = 1; $i <= AppServiceProvider::RESTAURANT_MAP_REQUESTS_PER_MINUTE; $i++) {
            restaurantsGeoJsonFrom('203.0.113.7')->assertOk();
        }

        $limited = restaurantsGeoJsonFrom('203.0.113.7')->assertStatus(429)->assertHeader('Retry-After');

        // Un error no se guarda en ninguna caché como si fuera la lista.
        expect((string) $limited->headers->get('Cache-Control'))->not->toContain('public')
            ->and($limited->headers->get('Content-Type'))->toContain('application/json');

        $this->travel(61)->seconds();

        restaurantsGeoJsonFrom('203.0.113.7')->assertOk();
    });

    test('cuenta por la IP de quien pide, no por la del proxy que comparten todos', function () {
        for ($i = 1; $i <= AppServiceProvider::RESTAURANT_MAP_REQUESTS_PER_MINUTE; $i++) {
            restaurantsGeoJsonFrom('203.0.113.7')->assertOk();
        }

        restaurantsGeoJsonFrom('203.0.113.7')->assertStatus(429);
        restaurantsGeoJsonFrom('198.51.100.20')->assertOk();
    });
});

test('hace las mismas consultas con un restaurante que con muchos', function () {
    $seed = function (int $count): void {
        $categories = Category::factory()->count(2)->create();

        Restaurant::factory()->count($count)->create()->each(function (Restaurant $restaurant) use ($categories) {
            $restaurant->categories()->attach($categories);
            OpeningHour::factory()->for($restaurant)->create(['weekday' => 1]);
            SpecialHour::factory()->for($restaurant)->create(['on_date' => now()->toDateString()]);
            DeliveryZone::factory()->for($restaurant)->create();
        });
    };
    $queries = function (): int {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->get(RESTAURANTS_GEOJSON)->assertOk();
        DB::disableQueryLog();

        return count(DB::getQueryLog());
    };

    $seed(1);
    $withOne = $queries();
    $seed(8);
    $withNine = $queries();

    // Una por tabla: restaurantes (con si tiene zonas), categorías, horario semanal y horarios especiales.
    expect($withOne)->toBe(4)
        ->and($withNine)->toBe(4)
        ->and($this->get(RESTAURANTS_GEOJSON)->json('features'))->toHaveCount(9);
});
