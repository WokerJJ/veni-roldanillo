<?php

use App\Enums\Fulfillment;
use App\Http\Controllers\Api\OrderIntentController;
use App\Models\OrderIntent;
use App\Models\Restaurant;
use App\Models\User;
use App\Providers\AppServiceProvider;
use Illuminate\Cache\RateLimiter as Limiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;

/*
| POST /api/restaurants/{slug}/order-intents (#22, ADR 0031): el toque en
| «Enviar pedido por WhatsApp». Se guarda el restaurante, la hora y si era
| domicilio o recoger; nada que identifique a la persona, al dispositivo o el
| pedido.
*/

uses(RefreshDatabase::class);

/**
 * @param  array<string, mixed>  $body
 * @param  array<string, string>  $headers
 * @return TestResponse<Response>
 */
function sendOrderIntent(string $slug, array $body = ['fulfillment' => 'delivery'], array $headers = [], string $ip = '203.0.113.7'): TestResponse
{
    return sendOrderIntentTo("/api/restaurants/{$slug}/order-intents", $body, $headers, $ip);
}

/**
 * @param  array<string, mixed>  $body
 * @param  array<string, string>  $headers
 * @return TestResponse<Response>
 */
function sendOrderIntentTo(string $uri, array $body, array $headers = [], string $ip = '203.0.113.7'): TestResponse
{
    return test()->withServerVariables(['REMOTE_ADDR' => $ip])->postJson($uri, $body, $headers);
}

/** El origen de APP_URL, como lo manda el navegador en la cabecera Origin. */
function appOrigin(): string
{
    $url = parse_url(config()->string('app.url'));

    return ($url['scheme'] ?? 'http').'://'.($url['host'] ?? 'localhost').(isset($url['port']) ? ':'.$url['port'] : '');
}

test('registra el clic con el restaurante y la entrega, sin persona ni dispositivo', function () {
    $restaurant = Restaurant::factory()->claimed()->create();

    sendOrderIntent($restaurant->slug, ['fulfillment' => 'pickup'])->assertNoContent();

    $intent = OrderIntent::query()->sole();
    expect($intent->restaurant_id)->toBe($restaurant->id)
        ->and($intent->fulfillment)->toBe(Fulfillment::Pickup)
        ->and($intent->user_id)->toBeNull()
        ->and($intent->device_hash)->toBeNull()
        ->and($intent->confirmed)->toBeNull();
});

test('una ficha sin reclamar también cuenta', function () {
    $restaurant = Restaurant::factory()->create();

    sendOrderIntent($restaurant->slug)->assertNoContent();

    expect(OrderIntent::query()->count())->toBe(1);
});

test('no guarda nada de lo que el cliente mande además de la entrega', function () {
    $restaurant = Restaurant::factory()->claimed()->create();

    sendOrderIntent($restaurant->slug, [
        'fulfillment' => 'delivery',
        'restaurant_id' => 999,
        'user_id' => 1,
        'device_hash' => hash('sha256', 'x'),
        'confirmed' => true,
        'address' => 'Cra 5 #8-20',
        'name' => 'Ana',
        'items' => [['dish' => 'Sancocho', 'quantity' => 2]],
        'total' => 40000,
        'location' => ['latitude' => 4.41, 'longitude' => -76.15],
    ])->assertNoContent();

    $row = (array) DB::table('order_intents')->sole();
    expect($row['restaurant_id'])->toBe($restaurant->id)
        ->and($row['fulfillment'])->toBe('delivery')
        ->and($row['user_id'])->toBeNull()
        ->and($row['device_hash'])->toBeNull()
        ->and($row['confirmed'])->toBeNull()
        ->and(json_encode($row))->not->toContain('Cra 5')->not->toContain('Ana')->not->toContain('Sancocho');
    // Y la tabla no tiene dónde guardarlo.
    expect(Schema::getColumnListing('order_intents'))->not->toContain('address', 'items', 'total', 'latitude', 'ip');
});

test('aunque haya sesión, no se asocia a la cuenta', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $this->actingAs(User::factory()->create());

    sendOrderIntent($restaurant->slug)->assertNoContent();

    expect(OrderIntent::query()->sole()->user_id)->toBeNull();
});

test('responde 422 sin registrar si la entrega falta o no es domicilio ni recoger', function (array $body) {
    $restaurant = Restaurant::factory()->claimed()->create();

    sendOrderIntent($restaurant->slug, $body)->assertUnprocessable()->assertJsonValidationErrors('fulfillment');

    expect(OrderIntent::query()->count())->toBe(0);
})->with([
    'sin campo' => [[]],
    'otro valor' => [['fulfillment' => 'drone']],
    'no es texto' => [['fulfillment' => ['delivery']]],
]);

test('una ficha oculta, inexistente o sin WhatsApp responde 404 y no registra', function (string $case) {
    $slug = match ($case) {
        'oculta' => Restaurant::factory()->hidden()->create()->slug,
        'sin whatsapp' => Restaurant::factory()->claimed()->create(['whatsapp' => null])->slug,
        default => 'no-existe',
    };

    sendOrderIntent($slug)->assertNotFound();

    expect(OrderIntent::query()->count())->toBe(0);
})->with(['oculta', 'inexistente', 'sin whatsapp']);

test('sin JSON responde 415: un formulario de otro sitio no lo puede mandar', function () {
    $restaurant = Restaurant::factory()->claimed()->create();

    $this->post("/api/restaurants/{$restaurant->slug}/order-intents", ['fulfillment' => 'delivery'])->assertStatus(415);

    expect(OrderIntent::query()->count())->toBe(0);
});

test('lo que el navegador marca como de otro sitio responde 403', function () {
    $restaurant = Restaurant::factory()->claimed()->create();

    sendOrderIntent($restaurant->slug, headers: ['Sec-Fetch-Site' => 'cross-site'])->assertForbidden();
    sendOrderIntent($restaurant->slug, headers: ['Sec-Fetch-Site' => 'same-origin'])->assertNoContent();

    expect(OrderIntent::query()->count())->toBe(1);
});

test('un doble toque cuenta una vez; pasados unos segundos, o desde otra IP o a otro restaurante, cuenta de nuevo', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $other = Restaurant::factory()->claimed()->create();

    sendOrderIntent($restaurant->slug)->assertNoContent();
    sendOrderIntent($restaurant->slug)->assertNoContent();
    expect(OrderIntent::query()->count())->toBe(1);

    sendOrderIntent($other->slug)->assertNoContent();
    sendOrderIntent($restaurant->slug, ip: '198.51.100.4')->assertNoContent();
    expect(OrderIntent::query()->count())->toBe(3);

    $this->travel(OrderIntentController::DEDUPE_SECONDS + 1)->seconds();
    sendOrderIntent($restaurant->slug)->assertNoContent();
    expect(OrderIntent::query()->where('restaurant_id', $restaurant->id)->count())->toBe(3);
});

test('pasado el límite por minuto responde 429 por IP', function () {
    $restaurants = Restaurant::factory()->claimed()->count(2)->create();

    for ($i = 1; $i <= AppServiceProvider::ORDER_INTENTS_PER_MINUTE; $i++) {
        sendOrderIntent($restaurants[$i % 2]->slug)->assertNoContent();
    }

    sendOrderIntent($restaurants[0]->slug)->assertStatus(429)->assertHeader('Retry-After');
    sendOrderIntent($restaurants[0]->slug, ip: '198.51.100.21')->assertNoContent();
});

test('un Content-Type que solo menciona JSON responde 415 sin registrar (BUG-013)', function (string $contentType) {
    $restaurant = Restaurant::factory()->claimed()->create();

    $this->call('POST', "/api/restaurants/{$restaurant->slug}/order-intents", server: [
        'CONTENT_TYPE' => $contentType,
        'HTTP_ACCEPT' => 'application/json',
    ], content: '{"fulfillment":"delivery"}')->assertStatus(415);

    expect(OrderIntent::query()->count())->toBe(0);
})->with([
    'parámetro con /json' => ['text/plain; a=/json'],
    'tipo con +json' => ['text/plain+json'],
    'jsonp' => ['application/jsonp'],
]);

test('JSON con charset cuenta (BUG-013)', function () {
    $restaurant = Restaurant::factory()->claimed()->create();

    $this->call('POST', "/api/restaurants/{$restaurant->slug}/order-intents", server: [
        'CONTENT_TYPE' => 'application/json; charset=utf-8',
        'HTTP_ACCEPT' => 'application/json',
    ], content: '{"fulfillment":"delivery"}')->assertNoContent();

    expect(OrderIntent::query()->count())->toBe(1);
});

test('Sec-Fetch-Site distinto de same-origin responde 403 (BUG-013)', function (string $site) {
    $restaurant = Restaurant::factory()->claimed()->create();

    sendOrderIntent($restaurant->slug, headers: ['Sec-Fetch-Site' => $site])->assertForbidden();

    expect(OrderIntent::query()->count())->toBe(0);
})->with(['cross-site', 'same-site', 'none']);

test('un Origin distinto del de APP_URL responde 403; el propio cuenta (BUG-013)', function () {
    $restaurant = Restaurant::factory()->claimed()->create();

    sendOrderIntent($restaurant->slug, headers: ['Origin' => 'https://otro.example'])->assertForbidden();
    sendOrderIntent($restaurant->slug, headers: ['Origin' => 'null'])->assertForbidden();
    expect(OrderIntent::query()->count())->toBe(0);

    sendOrderIntent($restaurant->slug, headers: ['Origin' => appOrigin(), 'Sec-Fetch-Site' => 'same-origin'])->assertNoContent();
    expect(OrderIntent::query()->count())->toBe(1);
});

test('la entrega se lee solo del cuerpo JSON: la query string no cuenta (EVA-011)', function () {
    $restaurant = Restaurant::factory()->claimed()->create();

    sendOrderIntentTo("/api/restaurants/{$restaurant->slug}/order-intents?fulfillment=pickup", [])
        ->assertUnprocessable()->assertJsonValidationErrors('fulfillment');
    expect(OrderIntent::query()->count())->toBe(0);

    sendOrderIntentTo("/api/restaurants/{$restaurant->slug}/order-intents?fulfillment=pickup", ['fulfillment' => 'delivery'])->assertNoContent();
    expect(OrderIntent::query()->sole()->fulfillment)->toBe(Fulfillment::Delivery);
});

test('misma IP, distinta entrega en el mismo restaurante: cuentan dos (AUD-003)', function () {
    $restaurant = Restaurant::factory()->claimed()->create();

    sendOrderIntent($restaurant->slug, ['fulfillment' => 'delivery'])->assertNoContent();
    sendOrderIntent($restaurant->slug, ['fulfillment' => 'pickup'])->assertNoContent();

    expect(OrderIntent::query()->count())->toBe(2);
});

test('pasado el tope diario por IP y restaurante responde 204 sin registrar (BUG-014)', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $other = Restaurant::factory()->claimed()->create();

    for ($i = 1; $i <= OrderIntentController::DAILY_MAX + 1; $i++) {
        sendOrderIntent($restaurant->slug)->assertNoContent();
        $this->travel(OrderIntentController::DEDUPE_SECONDS + 1)->seconds();
    }

    expect(OrderIntent::query()->count())->toBe(OrderIntentController::DAILY_MAX);

    // Otro restaurante, u otra IP, tienen su propio tope.
    sendOrderIntent($other->slug)->assertNoContent();
    sendOrderIntent($restaurant->slug, ip: '198.51.100.4')->assertNoContent();
    expect(OrderIntent::query()->count())->toBe(OrderIntentController::DAILY_MAX + 2);

    // Al día siguiente vuelve a contar.
    $this->travel(1)->days();
    sendOrderIntent($restaurant->slug)->assertNoContent();
    expect(OrderIntent::query()->count())->toBe(OrderIntentController::DAILY_MAX + 3);
});

test('dos IPv6 del mismo /64 son la misma para el doble toque y el límite (BUG-014)', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $other = Restaurant::factory()->claimed()->create();

    sendOrderIntent($restaurant->slug, ip: '2001:db8:1:2::1')->assertNoContent();
    sendOrderIntent($restaurant->slug, ip: '2001:db8:1:2:ffff:ffff:ffff:ffff')->assertNoContent();
    expect(OrderIntent::query()->count())->toBe(1);

    // Otro /64 es otro cliente.
    sendOrderIntent($restaurant->slug, ip: '2001:db8:1:3::1')->assertNoContent();
    expect(OrderIntent::query()->count())->toBe(2);

    // Una IPv4 escrita como IPv6 (::ffff:a.b.c.d) es esa IPv4, no todo el /64 de ::ffff.
    sendOrderIntent($restaurant->slug, ip: '203.0.113.9')->assertNoContent();
    sendOrderIntent($restaurant->slug, ip: '::ffff:203.0.113.9')->assertNoContent();
    sendOrderIntent($restaurant->slug, ip: '::ffff:203.0.113.10')->assertNoContent();
    expect(OrderIntent::query()->count())->toBe(4);

    $this->travel(OrderIntentController::DEDUPE_SECONDS + 1)->seconds();
    $this->travel(1)->minutes();
    for ($i = 1; $i <= AppServiceProvider::ORDER_INTENTS_PER_MINUTE; $i++) {
        sendOrderIntent(($i % 2 === 0 ? $restaurant : $other)->slug, ip: "2001:db8:1:2::{$i}")->assertNoContent();
    }
    sendOrderIntent($restaurant->slug, ip: '2001:db8:1:2::abcd')->assertStatus(429);
    sendOrderIntent($restaurant->slug, ip: '2001:db8:1:3::abcd')->assertNoContent();
});

test('con el store database ninguna llave guarda la IP ni su md5; el doble toque caduca a los 10 s y el tope al día (EVA-010, BUG-016)', function () {
    // La caché de producción es la base (config/cache.php): las filas vencidas
    // se quedan hasta que veni:prune-expired las borra, cada hora.
    config(['cache.default' => 'database']);
    $limiter = new Limiter(Cache::store('database'));
    $orderIntents = app(Limiter::class)->limiter('order-intents');
    expect($orderIntents)->toBeInstanceOf(Closure::class);
    $limiter->for('order-intents', $orderIntents);
    app()->instance(Limiter::class, $limiter);
    RateLimiter::clearResolvedInstance(Limiter::class);

    $restaurant = Restaurant::factory()->claimed()->create();
    $ip = '203.0.113.77';
    $table = config()->string('cache.stores.database.table');

    sendOrderIntent($restaurant->slug, ip: $ip)->assertNoContent();

    $rows = DB::table($table)->get(['key', 'expiration']);
    expect($rows)->not->toBeEmpty();
    foreach ($rows as $row) {
        expect($row->key)->not->toContain($ip)->not->toContain(md5('order-intents'.$ip));
    }
    expect(json_encode(DB::table('order_intents')->get()))->not->toContain($ip);

    $expiration = fn (string $kind): mixed => $rows->first(fn (object $row): bool => str_contains($row->key, "order-intent:{$kind}:") && ! str_ends_with($row->key, ':timer'))?->expiration;
    expect($expiration('dedupe'))->toBe(now()->getTimestamp() + OrderIntentController::DEDUPE_SECONDS)
        ->and($expiration('daily'))->toBe(now()->getTimestamp() + OrderIntentController::DAILY_SECONDS);

    // La limpieza horaria borra la huella del doble toque cuando vence; la del tope sigue.
    $this->travel(OrderIntentController::DEDUPE_SECONDS + 1)->seconds();
    $this->artisan('veni:prune-expired')->assertSuccessful();
    expect(DB::table($table)->where('key', 'like', '%order-intent:dedupe:%')->count())->toBe(0)
        ->and(DB::table($table)->where('key', 'like', '%order-intent:daily:%')->count())->toBeGreaterThan(0);
});

test('el cuerpo es el de tests/contracts/order-intent.request.json, el que manda el carrito (EVA-012)', function () {
    $contract = json_decode((string) file_get_contents(base_path('tests/contracts/order-intent.request.json')), true, flags: JSON_THROW_ON_ERROR);
    $allowed = array_map(fn (Fulfillment $case): string => $case->value, Fulfillment::cases());

    expect(array_keys($contract['body']))->toBe(['fulfillment'])
        ->and($contract['body']['fulfillment'])->toEqualCanonicalizing($allowed)
        ->and($contract['contentType'])->toBe('application/json');

    $restaurant = Restaurant::factory()->claimed()->create();
    sendOrderIntent($restaurant->slug, $contract['example'])->assertNoContent();
    foreach ($contract['body']['fulfillment'] as $value) {
        sendOrderIntent($restaurant->slug, ['fulfillment' => $value], ip: '198.51.100.30')->assertNoContent();
    }

    expect(OrderIntent::query()->count())->toBe(1 + count($allowed));
});
