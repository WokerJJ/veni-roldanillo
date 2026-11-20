<?php

use App\Enums\FieldSubmissionStatus;
use App\Models\Category;
use App\Models\FieldSubmission;
use App\Models\Restaurant;
use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Support\GeoPoint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

/**
 * La API JSON del modo Campo (ADR 0048): solo administración, idempotente por
 * el uuid del teléfono y sin confiar en nada que no sea el contenido.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function fieldBody(array $overrides = []): array
{
    static $categoryId = null;
    $categoryId = Category::query()->value('id') ?? Category::factory()->create()->id;

    return array_merge([
        'name' => 'Sazón del Parque',
        'category_ids' => [$categoryId],
        'address' => 'Carrera 8 # 10-20',
        'reference' => 'Junto a la iglesia',
        'phone' => '',
        'whatsapp' => '300 111 2233',
        'delivery' => true,
        'payment_methods' => ['nequi', 'cash'],
        'hours' => [
            ['weekday' => 1, 'opens' => '11:00', 'closes' => '15:00'],
            ['weekday' => 1, 'opens' => '18:00', 'closes' => '02:00'],
        ],
        'latitude' => 4.4120,
        'longitude' => -76.1540,
        'location_source' => 'device',
        'owner_name' => 'Marta Ríos',
        'owner_role' => 'owner',
        'owner_phone' => '+57 300-444-5566',
        'captured_at' => now()->subMinutes(2)->toIso8601String(),
        'restaurant_id' => null,
        'distinct_from' => [],
    ], $overrides);
}

test('el shell abre sin sesión ni cookies: no lleva datos de nadie', function () {
    $this->withoutVite();

    $response = $this->get('/campo')->assertOk();

    expect($response->headers->getCookies())->toBe([])
        ->and($response->headers->get('Content-Security-Policy'))->toContain("default-src 'self'")
        // La marca con que el service worker reconoce el shell (runtimeCaching.ts: campoShell).
        ->and($response->getContent())->toContain('<meta name="veni-campo-shell" content="1">');
});

test('sin sesión es 401 y una cuenta que no es de administración, 403', function () {
    $this->getJson('/campo/api/me')->assertUnauthorized();
    $this->putJson('/campo/api/submissions/'.Str::uuid(), fieldBody())->assertUnauthorized();

    $this->actingAs(User::factory()->create());
    $this->getJson('/campo/api/me')->assertForbidden();
    $this->putJson('/campo/api/submissions/'.Str::uuid(), fieldBody())->assertForbidden();
    $this->postJson('/campo/api/duplicates', ['name' => 'x y', 'latitude' => 4.41, 'longitude' => -76.15])->assertForbidden();

    expect(FieldSubmission::query()->count())->toBe(0);
});

test('me da lo que el shell necesita para trabajar sin señal y no se guarda en ninguna caché', function () {
    Category::factory()->create(['name_es' => 'Pizzas']);
    $admin = User::factory()->admin()->create(['name' => 'Jhon']);
    $this->actingAs($admin);

    $response = $this->getJson('/campo/api/me')->assertOk()
        ->assertJsonPath('user.name', 'Jhon')
        ->assertJsonPath('user.id', $admin->id)
        ->assertJsonPath('categories.0.name_es', 'Pizzas')
        ->assertJsonPath('payment_methods', ['cash', 'nequi', 'daviplata', 'card']);

    expect($response->json('csrf'))->toBeString()->not->toBeEmpty()
        ->and($response->headers->get('Cache-Control'))->toContain('no-store')
        ->and($response->headers->get('X-Robots-Tag'))->toContain('noindex');
});

test('enviar crea la captura (201), normaliza los celulares y deja las fichas como estaban', function () {
    $admin = User::factory()->admin()->create();
    $this->actingAs($admin);
    $uuid = (string) Str::uuid();

    $this->putJson("/campo/api/submissions/{$uuid}", fieldBody(['unexpected' => 'ignorado']))
        ->assertCreated()
        ->assertJsonPath('uuid', $uuid)
        ->assertJsonPath('status', 'submitted')
        ->assertJsonPath('revision', 1);

    $submission = FieldSubmission::query()->firstOrFail();

    expect($submission->captured_by)->toBe($admin->id)
        ->and($submission->owner_phone)->toBe('573004445566')
        ->and($submission->payload['whatsapp'])->toBe('573001112233')
        ->and($submission->payload['phone'])->toBeNull()
        ->and($submission->payload['payment_methods'])->toBe(['cash', 'nequi'])
        ->and($submission->payload)->not->toHaveKey('unexpected')
        ->and(Restaurant::query()->count())->toBe(0);
});

test('reintentar el mismo envío da 200 y no duplica; con otro contenido, 409', function () {
    $this->actingAs(User::factory()->admin()->create());
    $uuid = (string) Str::uuid();

    $this->putJson("/campo/api/submissions/{$uuid}", fieldBody())->assertCreated();
    $this->putJson("/campo/api/submissions/{$uuid}", fieldBody())->assertOk()->assertJsonPath('status', 'submitted');
    $this->putJson("/campo/api/submissions/{$uuid}", fieldBody(['name' => 'Otro']))->assertStatus(409);

    expect(FieldSubmission::query()->count())->toBe(1);
});

test('el identificador de otra cuenta responde 404 y no revela nada', function () {
    $uuid = (string) Str::uuid();

    $this->actingAs(User::factory()->admin()->create());
    $this->putJson("/campo/api/submissions/{$uuid}", fieldBody())->assertCreated();

    $this->actingAs(User::factory()->admin()->create());
    $this->putJson("/campo/api/submissions/{$uuid}", fieldBody())->assertNotFound();
    $this->postJson("/campo/api/submissions/{$uuid}/confirmation-link")->assertNotFound();
    expect($this->getJson('/campo/api/submissions')->assertOk()->json('submissions'))->toBe([]);
});

test('lo inválido se rechaza con 422 y el campo que falló, sin llegar a un 500', function (array $override, string $field) {
    $this->actingAs(User::factory()->admin()->create());

    $this->putJson('/campo/api/submissions/'.Str::uuid(), fieldBody($override))
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);

    expect(FieldSubmission::query()->count())->toBe(0);
})->with([
    'un fijo en el celular del dueño' => [['owner_phone' => '6021234567'], 'owner_phone'],
    'sin celular del dueño' => [['owner_phone' => ''], 'owner_phone'],
    'whatsapp inválido' => [['whatsapp' => '12345'], 'whatsapp'],
    'un punto fuera de Roldanillo' => [['latitude' => 40.4, 'longitude' => -3.7], 'latitude'],
    'longitud fuera de rango' => [['longitude' => -70.0], 'longitude'],
    'categoría que no existe' => [['category_ids' => [999999]], 'category_ids.0'],
    'sin categorías' => [['category_ids' => []], 'category_ids'],
    'franjas que se cruzan' => [['hours' => [['weekday' => 2, 'opens' => '10:00', 'closes' => '14:00'], ['weekday' => 2, 'opens' => '13:00', 'closes' => '16:00']]], 'hours'],
    'la noche del sábado pisa la madrugada del domingo' => [['hours' => [['weekday' => 6, 'opens' => '22:00', 'closes' => '02:00'], ['weekday' => 0, 'opens' => '01:00', 'closes' => '03:00']]], 'hours'],
    'abre y cierra a la misma hora' => [['hours' => [['weekday' => 2, 'opens' => '10:00', 'closes' => '10:00']]], 'hours'],
    'hora mal escrita' => [['hours' => [['weekday' => 2, 'opens' => '25:00', 'closes' => '10:00']]], 'hours.0.opens'],
    'día inexistente' => [['hours' => [['weekday' => 7, 'opens' => '10:00', 'closes' => '12:00']]], 'hours.0.weekday'],
    'medio de pago desconocido' => [['payment_methods' => ['bitcoin']], 'payment_methods.0'],
    'rol del dueño desconocido' => [['owner_role' => 'employee'], 'owner_role'],
    'el nombre como arreglo' => [['name' => ['a']], 'name'],
    'control en el nombre' => [['name' => "Sazón\0 del Parque"], 'name'],
    'origen del punto desconocido' => [['location_source' => 'satellite'], 'location_source'],
    'sin nombre' => [['name' => ' '], 'name'],
]);

test('un cuerpo con UTF-8 inválido falla la validación, no la base', function () {
    $this->actingAs(User::factory()->admin()->create());

    $json = json_encode(fieldBody(['name' => 'ZZZ'])) ?: '';
    $this->call('PUT', '/campo/api/submissions/'.Str::uuid(), [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], str_replace('ZZZ', "Saz\xC3\x28n", $json))
        ->assertUnprocessable();

    expect(FieldSubmission::query()->count())->toBe(0);
});

test('un identificador que no es uuid no existe como ruta', function () {
    $this->actingAs(User::factory()->admin()->create());

    $this->putJson('/campo/api/submissions/no-es-un-uuid', fieldBody())->assertNotFound();
});

test('vincular una ficha publicada se rechaza con 422 en restaurant_id', function () {
    $this->actingAs(User::factory()->admin()->create());
    $published = Restaurant::factory()->create();

    $this->putJson('/campo/api/submissions/'.Str::uuid(), fieldBody(['restaurant_id' => $published->id]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('restaurant_id');
});

test('los duplicados salen con el nombre parecido o a menos de 50 m, solo para administración', function () {
    $near = Restaurant::factory()->create(['name' => 'Cerca de Todo', 'location' => new GeoPoint(4.41205, -76.1540)]);
    Restaurant::factory()->create(['name' => 'Lejano', 'location' => new GeoPoint(4.4090, -76.1590)]);
    $this->actingAs(User::factory()->admin()->create());

    $candidates = $this->postJson('/campo/api/duplicates', ['name' => 'Sazón del Parque', 'latitude' => 4.4120, 'longitude' => -76.1540])
        ->assertOk()->json('candidates');

    expect(array_column($candidates, 'restaurant_id'))->toBe([$near->id])
        ->and($candidates[0])->toHaveKeys(['name', 'status', 'distance_m', 'from_osm'])
        ->and($candidates[0])->not->toHaveKey('whatsapp');

    $this->postJson('/campo/api/duplicates', ['name' => '', 'latitude' => 4.41, 'longitude' => -76.15])->assertUnprocessable();
});

test('el enlace de confirmación guarda solo el hash y trae el mensaje de WhatsApp para el dueño', function () {
    $this->actingAs(User::factory()->admin()->create());
    $uuid = (string) Str::uuid();
    $this->putJson("/campo/api/submissions/{$uuid}", fieldBody())->assertCreated();

    $response = $this->postJson("/campo/api/submissions/{$uuid}/confirmation-link")->assertOk();
    $url = $response->json('url');
    $code = Str::afterLast($url, '/');
    $whatsapp = $response->json('whatsapp_url');

    expect($url)->toStartWith(config('app.url').'/confirmar/')
        ->and($code)->toHaveLength(43)
        ->and(DB::table('field_submissions')->where('confirmation_token_hash', $code)->exists())->toBeFalse()
        ->and(DB::table('field_submissions')->where('confirmation_token_hash', FieldSubmission::hashCode($code))->exists())->toBeTrue()
        ->and($whatsapp)->toStartWith('https://wa.me/573004445566?text=');

    $text = urldecode(Str::after($whatsapp, 'text='));

    expect($text)->toContain('Marta Ríos')
        ->toContain('Sazón del Parque')
        ->toContain('Carrera 8 # 10-20')
        ->toContain('lunes: 11:00–15:00, 18:00–02:00')
        ->toContain($url);
});

test('no se pide el enlace de una captura que ya no espera', function () {
    $admin = User::factory()->admin()->create();
    $this->actingAs($admin);
    $submission = FieldSubmission::factory()->confirmed()->create(['captured_by' => $admin->id]);

    $this->postJson("/campo/api/submissions/{$submission->uuid}/confirmation-link")->assertStatus(409);
});

test('la lista trae las capturas de la cuenta y el contenido solo de las devueltas', function () {
    $admin = User::factory()->admin()->create();
    $this->actingAs($admin);
    $sent = FieldSubmission::factory()->create(['captured_by' => $admin->id]);
    $returned = FieldSubmission::factory()->create([
        'captured_by' => $admin->id, 'status' => FieldSubmissionStatus::Returned,
        'review_note' => 'Falta la referencia', 'reviewed_at' => now(),
    ]);
    FieldSubmission::factory()->create();

    $list = collect($this->getJson('/campo/api/submissions')->assertOk()->json('submissions'))->keyBy('uuid');

    expect($list)->toHaveCount(2)
        ->and($list[$sent->uuid])->not->toHaveKey('content')
        ->and($list[$returned->uuid]['review_note'])->toBe('Falta la referencia')
        ->and($list[$returned->uuid]['content'])->toHaveKeys(['name', 'latitude', 'longitude', 'owner_name', 'hours']);
});

test('pasado el límite de envíos por cuenta, 429', function () {
    $this->actingAs(User::factory()->admin()->create());

    for ($i = 0; $i < AppServiceProvider::FIELD_SUBMISSIONS_PER_HOUR; $i++) {
        $this->putJson('/campo/api/submissions/'.Str::uuid(), [])->assertUnprocessable();
    }

    $this->putJson('/campo/api/submissions/'.Str::uuid(), fieldBody())->assertTooManyRequests();
});

test('el shell lleva los textos en los dos idiomas, para abrir sin señal, y ningún script en línea', function () {
    $this->withoutVite();

    $html = $this->get('/campo')->assertOk()->getContent() ?: '';

    expect($html)->toContain('id="campo-texts"')
        ->and(preg_match('#<script type="application/json" id="campo-texts">(.*?)</script>#s', $html, $match))->toBe(1);

    $texts = json_decode($match[1], true, flags: JSON_THROW_ON_ERROR);

    expect($texts['es']['home']['new'])->toBe('Nueva ficha')
        ->and($texts['en']['home']['new'])->toBe('New listing')
        ->and($texts['es']['days'])->toHaveCount(7);

    // Los demás scripts son de archivo (módulos): sin código en línea que la CSP bloquearía.
    preg_match_all('#<script(?![^>]*application/json)[^>]*>(.*?)</script>#s', $html, $scripts);
    expect(array_filter(array_map('trim', $scripts[1])))->toBe([]);
});

test('los envíos y el enlace solo se aceptan desde la propia app y en JSON; el GET de me no lleva cuerpo', function () {
    $this->actingAs(User::factory()->admin()->create());
    $uuid = (string) Str::uuid();
    $plain = ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'text/plain'];

    $this->withHeaders(['Origin' => 'https://otro-sitio.example'])->putJson("/campo/api/submissions/{$uuid}", fieldBody())->assertForbidden();
    $this->withHeaders(['Sec-Fetch-Site' => 'cross-site'])->postJson("/campo/api/submissions/{$uuid}/confirmation-link")->assertForbidden();
    $this->withHeaders(['Origin' => 'https://otro-sitio.example'])->postJson('/campo/api/duplicates', ['name' => 'x y', 'latitude' => 4.41, 'longitude' => -76.15])->assertForbidden();
    $this->call('PUT', "/campo/api/submissions/{$uuid}", [], [], [], $plain, 'name=x')->assertStatus(415);
    $this->call('POST', '/campo/api/duplicates', [], [], [], $plain, 'name=x')->assertStatus(415);
    $this->getJson('/campo/api/me')->assertOk();

    expect(FieldSubmission::query()->count())->toBe(0);

    $this->withHeaders(['Origin' => rtrim(config()->string('app.url'), '/'), 'Sec-Fetch-Site' => 'same-origin'])
        ->putJson("/campo/api/submissions/{$uuid}", fieldBody())->assertCreated();
});

test('reenviar una devuelta con el mismo contenido da 409 content_unchanged; corregida, se acepta', function () {
    $admin = User::factory()->admin()->create();
    $this->actingAs($admin);
    $uuid = (string) Str::uuid();
    $this->putJson("/campo/api/submissions/{$uuid}", fieldBody())->assertCreated();
    FieldSubmission::query()->where('uuid', $uuid)->update(['status' => 'returned', 'review_note' => 'Corregí', 'reviewed_at' => now()]);

    $this->putJson("/campo/api/submissions/{$uuid}", fieldBody())->assertStatus(409)->assertJsonPath('message', 'content_unchanged');
    expect(FieldSubmission::query()->where('uuid', $uuid)->firstOrFail()->status)->toBe(FieldSubmissionStatus::Returned);

    $this->putJson("/campo/api/submissions/{$uuid}", fieldBody(['reference' => 'Frente a la plaza']))->assertOk()->assertJsonPath('revision', 2);
});

test('la búsqueda de duplicados acepta solo puntos de Roldanillo, como el envío', function (array $override, string $field) {
    $this->actingAs(User::factory()->admin()->create());

    $this->postJson('/campo/api/duplicates', [...['name' => 'Sazón', 'latitude' => 4.41, 'longitude' => -76.15], ...$override])
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);
})->with([
    'latitud fuera del recuadro' => [['latitude' => 40.4], 'latitude'],
    'longitud fuera del recuadro' => [['longitude' => -3.7], 'longitude'],
    'sin coordenadas' => [['latitude' => null], 'latitude'],
]);

test('la lista va de la más reciente a la más antigua y desempata por id, siempre en el mismo orden', function () {
    $admin = User::factory()->admin()->create();
    $this->actingAs($admin);
    $at = now()->subHour();
    $oldest = FieldSubmission::factory()->create(['captured_by' => $admin->id, 'received_at' => $at->copy()->subDay()]);
    $first = FieldSubmission::factory()->create(['captured_by' => $admin->id, 'received_at' => $at]);
    $second = FieldSubmission::factory()->create(['captured_by' => $admin->id, 'received_at' => $at]);
    $newest = FieldSubmission::factory()->create(['captured_by' => $admin->id, 'received_at' => $at->copy()->addMinute()]);

    $uuids = array_column($this->getJson('/campo/api/submissions')->assertOk()->json('submissions'), 'uuid');

    expect($uuids)->toBe([$newest->uuid, $second->uuid, $first->uuid, $oldest->uuid]);
});
