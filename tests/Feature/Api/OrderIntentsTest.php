<?php

use App\Enums\Fulfillment;
use App\Http\Controllers\Api\OrderIntentController;
use App\Models\OrderIntent;
use App\Models\Restaurant;
use App\Models\User;
use App\Providers\AppServiceProvider;
use Illuminate\Cache\Events\KeyWritten;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
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
    return test()->withServerVariables(['REMOTE_ADDR' => $ip])->postJson("/api/restaurants/{$slug}/order-intents", $body, $headers);
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

test('la IP no queda en la base: solo como huella en la llave de la caché', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $keys = [];
    Event::listen(KeyWritten::class, function (KeyWritten $event) use (&$keys): void {
        $keys[] = $event->key;
    });

    sendOrderIntent($restaurant->slug, ip: '203.0.113.77')->assertNoContent();

    $dedupe = array_values(array_filter($keys, fn (string $key): bool => str_starts_with($key, 'order-intent:')));
    expect($dedupe)->toHaveCount(1)
        ->and($dedupe[0])->not->toContain('203.0.113.77')
        ->and(json_encode(DB::table('order_intents')->get()))->not->toContain('203.0.113.77');
});

test('pasado el límite por minuto responde 429 por IP', function () {
    $restaurants = Restaurant::factory()->claimed()->count(2)->create();

    for ($i = 1; $i <= AppServiceProvider::ORDER_INTENTS_PER_MINUTE; $i++) {
        sendOrderIntent($restaurants[$i % 2]->slug)->assertNoContent();
    }

    sendOrderIntent($restaurants[0]->slug)->assertStatus(429)->assertHeader('Retry-After');
    sendOrderIntent($restaurants[0]->slug, ip: '198.51.100.21')->assertNoContent();
});
