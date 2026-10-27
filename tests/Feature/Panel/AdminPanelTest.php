<?php

use App\Actions\Restaurants\ApproveRestaurantClaim;
use App\Enums\ClaimStatus;
use App\Enums\RestaurantRole;
use App\Enums\RestaurantStatus;
use App\Filament\Admin\Auth\Login as AdminLogin;
use App\Filament\Admin\Resources\Claims\Pages\ListRestaurantClaims;
use App\Filament\Admin\Resources\OsmDrafts\Pages\ListOsmDrafts;
use App\Filament\Admin\Resources\Removals\Pages\ListRemovalRequests;
use App\Filament\Admin\Resources\Restaurants\Pages\CreateRestaurant;
use App\Filament\Admin\Resources\Restaurants\Pages\EditRestaurant;
use App\Filament\Admin\Resources\Restaurants\Pages\ListRestaurants;
use App\Models\Restaurant;
use App\Models\RestaurantClaim;
use App\Models\RestaurantRemovalRequest;
use App\Models\RestaurantSource;
use App\Models\User;
use Database\Seeders\PanelAdminSeeder;
use Filament\Facades\Filament;
use Filament\Notifications\Livewire\Notifications;
use Filament\Notifications\NotificationMailbox;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Livewire\Livewire;

uses(RefreshDatabase::class);

/**
 * Panel de administración (#19, ADR 0027): solo users.role = admin, con
 * autorización estricta, la CSP del panel y las acciones de dominio.
 */
function actAsAdmin(?User $admin = null): User
{
    $admin ??= User::factory()->admin()->create();
    test()->actingAs($admin);
    Filament::setCurrentPanel(Filament::getPanel('admin'));
    Filament::bootCurrentPanel();

    return $admin;
}

/** Un borrador de OpenStreetMap: oculto y con su procedencia. */
function osmDraft(array $source = []): Restaurant
{
    $restaurant = Restaurant::factory()->hidden()->create(['verified_at' => null]);
    DB::table('restaurant_sources')->insert([
        'restaurant_id' => $restaurant->id, 'source' => RestaurantSource::OPENSTREETMAP, 'element_type' => 'node',
        'element_id' => $restaurant->id, 'element_kind' => 'amenity=cafe', 'fetched_at' => now(),
        'imported_hash' => str_repeat('a', 64), ...$source,
    ]);

    return $restaurant;
}

describe('quién entra', function () {
    $pages = fn () => [
        '/admin', '/admin/restaurants', '/admin/restaurants/create', '/admin/osm-drafts',
        '/admin/claims', '/admin/removals', '/admin/profile',
    ];

    test('administración abre todas las páginas', function () use ($pages) {
        $admin = User::factory()->admin()->create();
        $restaurant = Restaurant::factory()->create();

        foreach ([...$pages(), "/admin/restaurants/{$restaurant->id}/edit"] as $page) {
            $this->actingAs($admin)->get($page)->assertOk();
        }
    });

    test('un invitado va al login', function () use ($pages) {
        foreach ($pages() as $page) {
            $this->get($page)->assertRedirect('/admin/login');
        }
    });

    test('un dueño, un empleado o una cuenta cualquiera reciben 403', function (?RestaurantRole $role) use ($pages) {
        $restaurant = Restaurant::factory()->claimed()->create();
        $user = $role === null ? User::factory()->create() : panelMember($restaurant, $role);

        foreach ([...$pages(), "/admin/restaurants/{$restaurant->id}/edit"] as $page) {
            $this->actingAs($user)->get($page)->assertForbidden();
        }
    })->with(['dueño' => RestaurantRole::Owner, 'empleado' => RestaurantRole::Staff, 'sin restaurante' => null]);

    test('administración no entra al panel del dueño sin ser dueña', function () {
        $restaurant = Restaurant::factory()->claimed()->create();

        $this->actingAs(User::factory()->admin()->create())->get("/panel/{$restaurant->slug}")->assertForbidden();
    });

    test('el panel usa la autorización estricta, sin registro ni recuperación de contraseña', function () {
        $panel = Filament::getPanel('admin');

        expect($panel->isAuthorizationStrict())->toBeTrue()
            ->and($panel->hasRegistration())->toBeFalse()
            ->and($panel->hasPasswordReset())->toBeFalse();
    });

    test('el login lleva el perfil «panel» de la CSP y el nonce en cada script', function () {
        $response = $this->get('/admin/login')->assertOk();
        $header = (string) $response->headers->get('Content-Security-Policy');
        preg_match("/'nonce-([^']+)'/", $header, $match);
        preg_match_all('/<(script|style)\b[^>]*>/i', (string) $response->getContent(), $tags);

        expect($header)->toContain("'unsafe-eval'")->toContain("style-src-attr 'unsafe-inline'")->not->toContain('ui-avatars.com');
        foreach ($tags[0] as $tag) {
            expect($tag)->toContain("nonce=\"{$match[1]}\"");
        }
    });

    test('el login cuenta los intentos por cuenta aparte del panel del dueño', function () {
        $admin = User::factory()->admin()->create(['email' => 'admin@example.test', 'password' => 'clave-de-prueba']);
        Filament::setCurrentPanel(Filament::getPanel('admin'));

        foreach (range(1, 10) as $attempt) {
            Livewire::test(AdminLogin::class)->fillForm(['email' => 'admin@example.test', 'password' => 'mala'])->call('authenticate');
            if ($attempt % 5 === 0) {
                $this->travel(61)->seconds();
            }
        }

        Livewire::test(AdminLogin::class)->fillForm(['email' => 'admin@example.test', 'password' => 'clave-de-prueba'])->call('authenticate');
        $this->assertGuest();

        $this->travel(16)->minutes();
        Livewire::test(AdminLogin::class)->fillForm(['email' => 'admin@example.test', 'password' => 'clave-de-prueba'])->call('authenticate');
        $this->assertAuthenticatedAs($admin);
    });
});

describe('fichas', function () {
    test('el alta manual saca el slug del nombre y guarda lo que el dueño no toca', function () {
        actAsAdmin();
        Restaurant::factory()->create(['slug' => 'fonda-nueva']);

        Livewire::test(CreateRestaurant::class)
            ->fillForm([
                'name' => 'Fonda Nueva', 'status' => 'hidden', 'plan' => 'featured', 'verified' => true,
                'is_fictitious' => true, 'latitude' => 4.4123, 'longitude' => -76.1547,
            ])
            ->call('create')
            ->assertHasNoFormErrors();

        $restaurant = Restaurant::query()->where('slug', 'fonda-nueva-2')->sole();
        expect($restaurant->status)->toBe(RestaurantStatus::Hidden)
            ->and($restaurant->plan->value)->toBe('featured')
            ->and($restaurant->verified_at)->not->toBeNull()
            ->and($restaurant->is_fictitious)->toBeTrue()
            ->and($restaurant->location->latitude)->toEqualWithDelta(4.4123, 0.000001);
    });

    test('las reglas del estado: reclamada pide dueño y publicar pide verificada', function (array $data, string $field) {
        actAsAdmin();

        Livewire::test(CreateRestaurant::class)
            ->fillForm(['name' => 'Otra', 'plan' => 'free', 'latitude' => 4.41, 'longitude' => -76.15, ...$data])
            ->call('create')
            ->assertHasFormErrors([$field]);

        expect(Restaurant::query()->count())->toBe(0);
    })->with([
        'reclamada sin dueño' => [['status' => 'claimed', 'verified' => true], 'status'],
        'publicada sin verificar' => [['status' => 'unclaimed', 'verified' => false], 'status'],
        'slug con mayúsculas' => [['status' => 'hidden', 'slug' => 'Con Mayusculas'], 'slug'],
    ]);

    test('editar no pisa un cambio que el dueño guardó mientras estaba abierta', function () {
        actAsAdmin();
        $restaurant = Restaurant::factory()->claimed()->create(['name' => 'Original']);
        panelMember($restaurant);

        $page = Livewire::test(EditRestaurant::class, ['record' => $restaurant->getRouteKey()]);
        $this->travel(2)->seconds();
        Restaurant::query()->whereKey($restaurant->id)->update(['name' => 'Desde el panel del dueño', 'updated_at' => now()]);

        $page->fillForm(['plan' => 'featured'])->call('save')->assertNotified(__('panel.errors.conflict'));

        expect($restaurant->fresh()?->name)->toBe('Desde el panel del dueño')
            ->and($restaurant->fresh()?->plan->value)->toBe('free');
    });

    test('editar desde administración no mueve «Actualizada por el restaurante»', function () {
        actAsAdmin();
        $restaurant = Restaurant::factory()->claimed()->create(['updated_by_owner_at' => null]);
        panelMember($restaurant);

        Livewire::test(EditRestaurant::class, ['record' => $restaurant->getRouteKey()])
            ->fillForm(['plan' => 'featured'])
            ->call('save')
            ->assertHasNoFormErrors();

        expect($restaurant->fresh()?->plan->value)->toBe('featured')
            ->and($restaurant->fresh()?->updated_by_owner_at)->toBeNull();
    });

    test('moderar: ocultar y volver a mostrar una ficha', function () {
        actAsAdmin();
        $restaurant = Restaurant::factory()->claimed()->create();
        panelMember($restaurant);

        Livewire::test(ListRestaurants::class)->callTableAction('hide', $restaurant);
        expect($restaurant->fresh()?->status)->toBe(RestaurantStatus::Hidden);

        Livewire::test(ListRestaurants::class)->callTableAction('show', $restaurant, data: ['verified_now' => false]);
        expect($restaurant->fresh()?->status)->toBe(RestaurantStatus::Claimed);
    });
});

describe('borradores de OpenStreetMap', function () {
    test('la lista muestra solo los borradores ocultos sin descartar', function () {
        actAsAdmin();
        $draft = osmDraft();
        $dismissed = osmDraft(['dismissed_at' => now()]);
        $own = Restaurant::factory()->hidden()->create();

        Livewire::test(ListOsmDrafts::class)
            ->assertCanSeeTableRecords([$draft])
            ->assertCanNotSeeTableRecords([$dismissed, $own]);
    });

    test('publicar exige confirmar la verificación y deja la ficha sin reclamar y verificada', function () {
        actAsAdmin();
        $draft = osmDraft();

        Livewire::test(ListOsmDrafts::class)
            ->callTableAction('publish', $draft, data: ['verified_now' => false])
            ->assertHasTableActionErrors(['verified_now']);
        expect($draft->fresh()?->status)->toBe(RestaurantStatus::Hidden);

        Livewire::test(ListOsmDrafts::class)->callTableAction('publish', $draft, data: ['verified_now' => true]);

        expect($draft->fresh()?->status)->toBe(RestaurantStatus::Unclaimed)
            ->and($draft->fresh()?->verified_at)->not->toBeNull();
    });

    test('descartar deja la ficha oculta y marca la procedencia', function () {
        actAsAdmin();
        $draft = osmDraft();

        Livewire::test(ListOsmDrafts::class)->callTableAction('dismiss', $draft);

        expect($draft->fresh()?->status)->toBe(RestaurantStatus::Hidden)
            ->and(RestaurantSource::query()->where('restaurant_id', $draft->id)->value('dismissed_at'))->not->toBeNull();
    });
});

describe('reclamos y retiros', function () {
    test('la lista arranca en las pendientes con el contacto y el mensaje', function () {
        actAsAdmin();
        $pending = RestaurantClaim::factory()->withoutAccount()->create(['message' => 'Soy la dueña desde 2010.']);
        $rejected = RestaurantClaim::factory()->withoutAccount()->rejected()->create();

        Livewire::test(ListRestaurantClaims::class)
            ->assertCanSeeTableRecords([$pending])
            ->assertCanNotSeeTableRecords([$rejected])
            ->assertSee('Soy la dueña desde 2010.')
            ->assertSee($pending->contact_phone);
    });

    test('aprobar un reclamo crea la cuenta y muestra la contraseña temporal una vez; el dueño entra a su panel', function () {
        actAsAdmin();
        $restaurant = Restaurant::factory()->create();
        $claim = RestaurantClaim::factory()->withoutAccount()->create(['restaurant_id' => $restaurant->id]);

        Livewire::test(ListRestaurantClaims::class)
            ->callTableAction('approve', $claim, data: ['email' => 'nueva.duena@example.test'])
            ->assertHasNoTableActionErrors();

        $owner = User::query()->where('email', 'nueva.duena@example.test')->sole();
        // Los avisos que vería administración (como Notification::assertNotified).
        app(NotificationMailbox::class)->flush();
        $inbox = new Notifications;
        $inbox->mount();
        $inbox->pullNotificationsFromSession();
        $body = (string) $inbox->notifications->map(fn ($notification) => $notification->getBody())->filter()->first();
        preg_match('/: ([A-Za-z0-9]{16})\./', $body, $match);

        expect($claim->fresh()?->status)->toBe(ClaimStatus::Approved)
            ->and($restaurant->fresh()?->status)->toBe(RestaurantStatus::Claimed)
            ->and($match[1] ?? null)->not->toBeNull()
            ->and(Hash::check($match[1], $owner->password))->toBeTrue();

        $this->actingAs($owner)->get("/panel/{$restaurant->slug}")->assertOk();
    });

    test('el dueño nuevo abre su perfil para cambiar la contraseña temporal, sin pasar antes por su restaurante', function () {
        $restaurant = Restaurant::factory()->claimed()->create();

        $this->actingAs(panelMember($restaurant))->get('/panel/profile')->assertOk()->assertSee('type="password"', false);
    });

    test('rechazar un reclamo pide el motivo', function () {
        actAsAdmin();
        $claim = RestaurantClaim::factory()->withoutAccount()->create();

        Livewire::test(ListRestaurantClaims::class)
            ->callTableAction('reject', $claim, data: ['note' => ''])
            ->assertHasTableActionErrors(['note' => 'required']);
        expect($claim->fresh()?->status)->toBe(ClaimStatus::Pending);

        Livewire::test(ListRestaurantClaims::class)->callTableAction('reject', $claim, data: ['note' => 'El celular no contesta.']);
        expect($claim->fresh()?->status)->toBe(ClaimStatus::Rejected)
            ->and($claim->fresh()?->review_note)->toBe('El celular no contesta.');
    });

    test('aprobar un retiro oculta la ficha: su página da 404 y sale del mapa', function () {
        $this->withoutVite();
        $restaurant = Restaurant::factory()->create();
        $removal = RestaurantRemovalRequest::factory()->create(['restaurant_id' => $restaurant->id]);
        $this->get("/restaurants/{$restaurant->slug}")->assertOk();

        actAsAdmin();
        Livewire::test(ListRemovalRequests::class)->callTableAction('approve', $removal);
        auth()->logout();

        expect($removal->fresh()?->status)->toBe(ClaimStatus::Approved);
        $this->get("/restaurants/{$restaurant->slug}")->assertNotFound();
        expect(collect($this->getJson('/api/restaurants.geojson')->json('features'))->pluck('properties.slug'))
            ->not->toContain($restaurant->slug);
    });
});

describe('nada de esto sale en lo público', function () {
    test('la ficha reclamada no muestra el contacto, el mensaje ni el motivo de la revisión', function () {
        $this->withoutVite();
        $restaurant = Restaurant::factory()->create();
        $claim = RestaurantClaim::factory()->withoutAccount()->create([
            'restaurant_id' => $restaurant->id, 'contact_name' => 'Nombre Privado', 'message' => 'Mensaje privado',
            'contact_email' => 'privado@example.test',
        ]);
        app(ApproveRestaurantClaim::class)->handle($claim, User::factory()->admin()->create(), 'privado@example.test');

        $page = (string) $this->get("/restaurants/{$restaurant->slug}")->assertOk()->getContent();
        $geojson = (string) $this->get('/api/restaurants.geojson')->getContent();

        foreach ([$page, $geojson] as $content) {
            expect($content)->not->toContain('Nombre Privado')->not->toContain('Mensaje privado')
                ->not->toContain('privado@example.test')->not->toContain((string) $claim->contact_phone);
        }
    });

    test('las direcciones de administración no están en el sitio público', function () {
        $this->withoutVite();
        $content = (string) $this->get('/credits')->assertOk()->getContent();

        expect($content)->not->toContain('/admin');
    });
});

describe('cuenta de ejemplo', function () {
    test('PanelAdminSeeder crea la cuenta de administración y solo agrega', function () {
        $this->seed(PanelAdminSeeder::class);
        $admin = User::query()->where('email', PanelAdminSeeder::EMAIL)->sole();

        expect($admin->isAdmin())->toBeTrue()
            ->and(Hash::check(PanelAdminSeeder::PASSWORD, $admin->password))->toBeTrue();

        $admin->forceFill(['name' => 'Cambiado'])->save();
        $this->seed(PanelAdminSeeder::class);

        expect(User::query()->where('email', PanelAdminSeeder::EMAIL)->sole()->name)->toBe('Cambiado');
    });
});
