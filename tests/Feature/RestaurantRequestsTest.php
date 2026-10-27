<?php

use App\Enums\ClaimantRole;
use App\Enums\ClaimStatus;
use App\Enums\RemovalRelationship;
use App\Enums\RestaurantStatus;
use App\Http\Controllers\RestaurantRequestController;
use App\Models\Restaurant;
use App\Models\RestaurantClaim;
use App\Models\RestaurantRemovalRequest;
use App\Models\User;
use App\Providers\AppServiceProvider;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use Symfony\Component\HttpFoundation\Response;

/*
| «¿Es tu negocio? Reclámalo» y «Pedir que retiren esta ficha» (#20, ADR
| 0026): formularios sin cuenta que dejan una solicitud pendiente para
| administración. Nada cambia solo, el doble envío no duplica, hay límite por
| IP y por celular, y los datos de contacto no salen nunca en lo público.
|
| Datos de ejemplo ficticios: celulares 300 000 xxxx y correos example.test.
*/

uses(RefreshDatabase::class);

beforeEach(function () {
    // Las páginas públicas no dependen de los assets compilados de Vite.
    $this->withoutVite();
});

/** @return array<string, mixed> */
function restaurantRequestsClaim(array $overrides = []): array
{
    return [
        'contact_name' => 'Persona de Prueba',
        'contact_phone' => '300 000 1234',
        'contact_email' => 'prueba@example.test',
        'claimant_role' => 'owner',
        'message' => 'Tengo el local desde 2019 (dato ficticio).',
        'accepts_privacy' => true,
        'website' => '',
        ...$overrides,
    ];
}

/** @return array<string, mixed> */
function restaurantRequestsRemoval(array $overrides = []): array
{
    return [
        'contact_name' => 'Persona de Prueba',
        'contact_phone' => '+57 300-000-5678',
        'contact_email' => '',
        'relationship' => 'owner',
        'reason' => 'El local cerró (dato ficticio).',
        'accepts_privacy' => '1',
        'website' => '',
        ...$overrides,
    ];
}

/**
 * @param  array<string, mixed>  $data
 * @return TestResponse<Response>
 */
function restaurantRequestsPost(string $path, array $data, string $ip = '203.0.113.20'): TestResponse
{
    return test()->withServerVariables(['REMOTE_ADDR' => $ip])->post($path, $data);
}

describe('reclamar una ficha', function () {
    test('la página del formulario existe solo para una ficha publicada sin reclamar', function () {
        Restaurant::factory()->create(['slug' => 'la-ceiba', 'name' => 'La Ceiba (ficticio)']);
        Restaurant::factory()->claimed()->create(['slug' => 'reclamada']);
        Restaurant::factory()->hidden()->create(['slug' => 'oculta']);

        $this->get('/restaurants/la-ceiba/claim')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Restaurants/Claim')
                ->where('restaurant', ['slug' => 'la-ceiba', 'name' => 'La Ceiba (ficticio)', 'fictitious' => true])
                ->where('sent', false));

        $this->get('/restaurants/reclamada/claim')->assertNotFound();
        $this->get('/restaurants/oculta/claim')->assertNotFound();
        $this->get('/restaurants/no-existe/claim')->assertNotFound();
        $this->actingAs(User::factory()->admin()->create())->get('/restaurants/oculta/claim')->assertNotFound();
    });

    test('guarda una solicitud pendiente con el celular normalizado y no cambia nada más', function () {
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
        $users = User::query()->count();

        restaurantRequestsPost('/restaurants/la-ceiba/claim', restaurantRequestsClaim())
            ->assertSessionHasNoErrors()
            ->assertRedirect('/restaurants/la-ceiba/claim')
            ->assertStatus(303);

        $claim = RestaurantClaim::query()->sole();
        expect($claim->restaurant_id)->toBe($restaurant->id)
            ->and($claim->user_id)->toBeNull()
            ->and($claim->status)->toBe(ClaimStatus::Pending)
            ->and($claim->contact_phone)->toBe('573000001234')
            ->and($claim->contact_email)->toBe('prueba@example.test')
            ->and($claim->claimant_role)->toBe(ClaimantRole::Owner)
            ->and($claim->privacy_accepted_at)->not->toBeNull()
            ->and($claim->reviewed_at)->toBeNull()
            ->and(User::query()->count())->toBe($users)
            ->and($restaurant->fresh()?->status)->toBe(RestaurantStatus::Unclaimed);
    });

    test('después de enviar, la página muestra la confirmación una vez', function () {
        Restaurant::factory()->create(['slug' => 'la-ceiba']);

        restaurantRequestsPost('/restaurants/la-ceiba/claim', restaurantRequestsClaim());

        $this->get('/restaurants/la-ceiba/claim')
            ->assertInertia(fn (Assert $page) => $page->where('sent', true));
        $this->get('/restaurants/la-ceiba/claim')
            ->assertInertia(fn (Assert $page) => $page->where('sent', false));
    });

    test('el doble envío con el mismo celular no duplica y responde igual', function () {
        Restaurant::factory()->create(['slug' => 'la-ceiba']);

        restaurantRequestsPost('/restaurants/la-ceiba/claim', restaurantRequestsClaim())->assertRedirect('/restaurants/la-ceiba/claim');
        restaurantRequestsPost('/restaurants/la-ceiba/claim', restaurantRequestsClaim(['contact_phone' => '3000001234', 'message' => 'Otra vez.']))
            ->assertSessionHasNoErrors()
            ->assertRedirect('/restaurants/la-ceiba/claim')
            ->assertSessionHas(RestaurantRequestController::SENT_FLASH, 'claim');

        expect(RestaurantClaim::query()->count())->toBe(1)
            ->and(RestaurantClaim::query()->sole()->message)->toBe('Tengo el local desde 2019 (dato ficticio).');
    });

    test('con la anterior resuelta, el mismo celular puede volver a pedirla', function () {
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
        RestaurantClaim::factory()->withoutAccount()->rejected()->for($restaurant)->create(['contact_phone' => '573000001234']);

        restaurantRequestsPost('/restaurants/la-ceiba/claim', restaurantRequestsClaim())->assertSessionHasNoErrors();

        expect(RestaurantClaim::query()->where('status', 'pending')->count())->toBe(1);
    });

    test('la base no deja dos pendientes con el mismo celular para el mismo restaurante', function () {
        $claim = RestaurantClaim::factory()->withoutAccount()->create();

        RestaurantClaim::factory()->withoutAccount()->create([
            'restaurant_id' => $claim->restaurant_id,
            'contact_phone' => $claim->contact_phone,
        ]);
    })->throws(QueryException::class, 'restaurant_claims_one_pending_contact');

    test('la base pide una cuenta o el contacto completo con la autorización', function (array $attributes, string $constraint) {
        expect(fn () => RestaurantClaim::factory()->withoutAccount()->create($attributes))
            ->toThrow(QueryException::class, $constraint);
    })->with([
        'sin autorización' => [['privacy_accepted_at' => null], 'restaurant_claims_claimant_present'],
        'sin celular' => [['contact_phone' => null], 'restaurant_claims_claimant_present'],
        'celular fijo' => [['contact_phone' => '576022290000'], 'restaurant_claims_contact_phone_format'],
        'nombre en blanco' => [['contact_name' => '   '], 'restaurant_claims_contact_name_not_blank'],
    ]);

    test('valida cada campo con un aviso claro', function (array $overrides, string $field, string $key) {
        Restaurant::factory()->create(['slug' => 'la-ceiba']);

        restaurantRequestsPost('/restaurants/la-ceiba/claim', restaurantRequestsClaim($overrides))
            ->assertSessionHasErrors([$field => trans($key, ['max' => $field === 'contact_name' ? 100 : 1000], 'es')]);

        expect(RestaurantClaim::query()->count())->toBe(0);
    })->with([
        'sin nombre' => [['contact_name' => ''], 'contact_name', 'requests.error.name'],
        'nombre de espacios de Unicode' => [['contact_name' => "\u{00A0}\u{2003}"], 'contact_name', 'requests.error.name'],
        'nombre muy largo' => [['contact_name' => str_repeat('a', 101)], 'contact_name', 'requests.error.name'],
        'sin celular' => [['contact_phone' => ''], 'contact_phone', 'requests.error.phone'],
        'celular fijo' => [['contact_phone' => '602 229 0000'], 'contact_phone', 'requests.error.phone'],
        'celular con letras' => [['contact_phone' => '300abc1234'], 'contact_phone', 'requests.error.phone'],
        'celular como lista' => [['contact_phone' => ['300']], 'contact_phone', 'requests.error.phone'],
        'correo inválido' => [['contact_email' => 'no-es-correo'], 'contact_email', 'requests.error.email'],
        'sin rol' => [['claimant_role' => ''], 'claimant_role', 'requests.error.role'],
        'rol que no existe' => [['claimant_role' => 'admin'], 'claimant_role', 'requests.error.role'],
        'mensaje muy largo' => [['message' => str_repeat('a', 1001)], 'message', 'requests.error.message'],
        'sin aceptar los datos' => [['accepts_privacy' => false], 'accepts_privacy', 'requests.error.privacy'],
    ]);

    test('pedida como JSON, la validación responde 422 con los avisos', function () {
        Restaurant::factory()->create(['slug' => 'la-ceiba']);

        $this->postJson('/restaurants/la-ceiba/claim', restaurantRequestsClaim(['contact_phone' => '12']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['contact_phone']);
    });

    test('los avisos salen en el idioma de la petición', function () {
        Restaurant::factory()->create(['slug' => 'la-ceiba']);

        $this->withCookie('locale', 'en')->withUnencryptedCookie('locale', 'en')
            ->post('/restaurants/la-ceiba/claim', restaurantRequestsClaim(['contact_phone' => '12']))
            ->assertSessionHasErrors(['contact_phone' => trans('requests.error.phone', [], 'en')]);
    });

    test('una ficha ya reclamada no recibe reclamos', function () {
        Restaurant::factory()->claimed()->create(['slug' => 'reclamada']);

        restaurantRequestsPost('/restaurants/reclamada/claim', restaurantRequestsClaim())->assertNotFound();

        expect(RestaurantClaim::query()->count())->toBe(0);
    });

    test('el campo trampa lleno responde como siempre y no guarda nada', function () {
        Restaurant::factory()->create(['slug' => 'la-ceiba']);

        restaurantRequestsPost('/restaurants/la-ceiba/claim', restaurantRequestsClaim(['website' => 'https://spam.example.test']))
            ->assertSessionHasNoErrors()
            ->assertRedirect('/restaurants/la-ceiba/claim')
            ->assertSessionHas(RestaurantRequestController::SENT_FLASH, 'claim');

        expect(RestaurantClaim::query()->count())->toBe(0);
    });

    test('sin el token CSRF, 419', function () {
        Restaurant::factory()->create(['slug' => 'la-ceiba']);

        // En pruebas Laravel no revisa el token: esta copia sí lo revisa.
        $this->app->instance(PreventRequestForgery::class, new class($this->app, $this->app['encrypter']) extends PreventRequestForgery
        {
            protected function runningUnitTests(): bool
            {
                return false;
            }
        });

        $this->post('/restaurants/la-ceiba/claim', restaurantRequestsClaim())->assertStatus(419);

        expect(RestaurantClaim::query()->count())->toBe(0);
    });
});

describe('pedir que retiren una ficha', function () {
    test('el formulario está en toda ficha publicada, reclamada o no', function () {
        Restaurant::factory()->create(['slug' => 'sin-reclamar']);
        Restaurant::factory()->claimed()->create(['slug' => 'reclamada']);
        Restaurant::factory()->hidden()->create(['slug' => 'oculta']);

        $this->get('/restaurants/sin-reclamar/removal')->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Restaurants/Removal')->where('sent', false));
        $this->get('/restaurants/reclamada/removal')->assertOk();
        $this->get('/restaurants/oculta/removal')->assertNotFound();
    });

    test('guarda la solicitud pendiente y no oculta la ficha', function () {
        $restaurant = Restaurant::factory()->claimed()->create(['slug' => 'reclamada']);

        restaurantRequestsPost('/restaurants/reclamada/removal', restaurantRequestsRemoval())
            ->assertSessionHasNoErrors()
            ->assertRedirect('/restaurants/reclamada/removal');

        $removal = RestaurantRemovalRequest::query()->sole();
        expect($removal->restaurant_id)->toBe($restaurant->id)
            ->and($removal->status)->toBe(ClaimStatus::Pending)
            ->and($removal->contact_phone)->toBe('573000005678')
            ->and($removal->contact_email)->toBeNull()
            ->and($removal->relationship)->toBe(RemovalRelationship::Owner)
            ->and($removal->privacy_accepted_at)->not->toBeNull()
            ->and($restaurant->fresh()?->status)->toBe(RestaurantStatus::Claimed);

        $this->get('/restaurants/reclamada/removal')->assertInertia(fn (Assert $page) => $page->where('sent', true));
        $this->get('/restaurants/reclamada')->assertOk();
    });

    test('el doble envío no duplica', function () {
        Restaurant::factory()->create(['slug' => 'la-ceiba']);

        restaurantRequestsPost('/restaurants/la-ceiba/removal', restaurantRequestsRemoval());
        restaurantRequestsPost('/restaurants/la-ceiba/removal', restaurantRequestsRemoval())->assertSessionHasNoErrors();

        expect(RestaurantRemovalRequest::query()->count())->toBe(1);
    });

    test('valida el motivo y la relación', function (array $overrides, string $field, string $key) {
        Restaurant::factory()->create(['slug' => 'la-ceiba']);

        restaurantRequestsPost('/restaurants/la-ceiba/removal', restaurantRequestsRemoval($overrides))
            ->assertSessionHasErrors([$field => trans($key, ['max' => 1000], 'es')]);

        expect(RestaurantRemovalRequest::query()->count())->toBe(0);
    })->with([
        'sin motivo' => [['reason' => ''], 'reason', 'requests.error.reason'],
        'motivo de espacios' => [['reason' => "\u{00A0}"], 'reason', 'requests.error.reason'],
        'motivo muy largo' => [['reason' => str_repeat('a', 1001)], 'reason', 'requests.error.reason'],
        'relación que no existe' => [['relationship' => 'vecino'], 'relationship', 'requests.error.relationship'],
        'sin aceptar los datos' => [['accepts_privacy' => '0'], 'accepts_privacy', 'requests.error.privacy'],
    ]);
});

describe('límites de peticiones', function () {
    test('por IP: pasado el límite por hora, 429 con el aviso', function () {
        Restaurant::factory()->create(['slug' => 'la-ceiba']);

        for ($i = 0; $i < AppServiceProvider::RESTAURANT_REQUESTS_PER_HOUR_PER_IP; $i++) {
            // Celulares distintos: el límite que se agota es el de la IP.
            restaurantRequestsPost('/restaurants/la-ceiba/removal', restaurantRequestsRemoval(['contact_phone' => sprintf('300000%04d', $i)]), '203.0.113.30')
                ->assertRedirect();
        }

        $response = restaurantRequestsPost('/restaurants/la-ceiba/claim', restaurantRequestsClaim(), '203.0.113.30')
            ->assertStatus(429)
            ->assertHeader('Retry-After');
        expect($response->getContent())->toBe(trans('requests.error.too_many', [], 'es'));

        // Otra IP sigue pudiendo.
        restaurantRequestsPost('/restaurants/la-ceiba/claim', restaurantRequestsClaim(), '203.0.113.31')->assertRedirect();
    });

    test('por celular: el mismo número desde otras IP también tiene tope por día', function () {
        Restaurant::factory()->count(AppServiceProvider::RESTAURANT_REQUESTS_PER_DAY_PER_PHONE + 1)->sequence(
            fn ($sequence) => ['slug' => 'local-'.$sequence->index],
        )->create();

        for ($i = 0; $i < AppServiceProvider::RESTAURANT_REQUESTS_PER_DAY_PER_PHONE; $i++) {
            restaurantRequestsPost("/restaurants/local-{$i}/claim", restaurantRequestsClaim(), "198.51.100.{$i}")->assertRedirect();
        }

        $last = AppServiceProvider::RESTAURANT_REQUESTS_PER_DAY_PER_PHONE;
        // Escrito de otra forma, es el mismo celular.
        restaurantRequestsPost("/restaurants/local-{$last}/claim", restaurantRequestsClaim(['contact_phone' => '+57 (300) 000.1234']), '198.51.100.200')
            ->assertStatus(429);

        expect(RestaurantClaim::query()->count())->toBe($last);
    });
});

describe('privacidad', function () {
    test('los datos de contacto no salen en la ficha pública ni en el mapa', function () {
        $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
        RestaurantClaim::factory()->withoutAccount()->for($restaurant)->create([
            'contact_name' => 'Nombre Secreto Ficticio', 'contact_phone' => '573009998877', 'contact_email' => 'secreto@example.test',
        ]);
        RestaurantRemovalRequest::factory()->for($restaurant)->create([
            'contact_name' => 'Otro Secreto Ficticio', 'contact_phone' => '573009998866', 'reason' => 'Motivo secreto ficticio',
        ]);

        $responses = [
            $this->get('/restaurants/la-ceiba'),
            $this->get('/restaurants/la-ceiba/claim'),
            $this->get('/restaurants/la-ceiba/removal'),
            $this->getJson('/api/restaurants.geojson'),
        ];

        foreach ($responses as $response) {
            $response->assertOk();
            foreach (['Secreto Ficticio', '3009998877', '3009998866', 'secreto@example.test', 'Motivo secreto'] as $secret) {
                expect($response->getContent())->not->toContain($secret);
            }
        }

        $this->get('/restaurants/la-ceiba')->assertInertia(fn (Assert $page) => $page
            ->missing('restaurant.claims')
            ->missing('restaurant.removal_requests')
            ->missing('restaurant.contact_phone'));
    });

    test('las resueltas se borran a los seis meses; las pendientes y las recientes se quedan', function () {
        $old = now()->subMonths(RestaurantClaim::RETENTION_MONTHS)->subDay();

        $oldClaim = RestaurantClaim::factory()->withoutAccount()->rejected()->create();
        DB::table('restaurant_claims')->where('id', $oldClaim->id)->update(['reviewed_at' => $old]);
        $recentClaim = RestaurantClaim::factory()->withoutAccount()->rejected()->create();
        $pendingClaim = RestaurantClaim::factory()->withoutAccount()->create(['created_at' => $old]);

        $oldRemoval = RestaurantRemovalRequest::factory()->rejected()->create();
        DB::table('restaurant_removal_requests')->where('id', $oldRemoval->id)->update(['reviewed_at' => $old]);
        $pendingRemoval = RestaurantRemovalRequest::factory()->create(['created_at' => $old]);

        Artisan::call('model:prune', ['--model' => [RestaurantClaim::class, RestaurantRemovalRequest::class]]);

        expect(RestaurantClaim::query()->pluck('id')->sort()->values()->all())->toBe([$recentClaim->id, $pendingClaim->id])
            ->and(RestaurantRemovalRequest::query()->pluck('id')->all())->toBe([$pendingRemoval->id]);
    });

    test('la limpieza está programada todos los días', function () {
        Artisan::call('schedule:list');

        expect(Artisan::output())->toContain('model:prune');
    });
});

describe('la ficha pública', function () {
    test('sin reclamar la marca sin verificar; reclamada, no (lo que decide el enlace «Reclámalo»)', function () {
        Restaurant::factory()->create(['slug' => 'sin-reclamar']);
        Restaurant::factory()->claimed()->create(['slug' => 'reclamada']);

        $this->get('/restaurants/sin-reclamar')->assertInertia(fn (Assert $page) => $page->where('restaurant.unverified', true));
        $this->get('/restaurants/reclamada')->assertInertia(fn (Assert $page) => $page->where('restaurant.unverified', false));
    });
});
