<?php

use App\Actions\Restaurants\ActionRefused;
use App\Actions\Restaurants\ApproveFieldSubmission;
use App\Actions\Restaurants\CloseFieldSubmission;
use App\Actions\Restaurants\ConfirmFieldSubmission;
use App\Actions\Restaurants\IssueConfirmationLink;
use App\Actions\Restaurants\ReceiveFieldSubmission;
use App\Enums\RestaurantStatus;
use App\Filament\Admin\Resources\FieldSubmissions\FieldSubmissionResource;
use App\Models\CatalogGroup;
use App\Models\CatalogItem;
use App\Models\CatalogVariant;
use App\Models\Category;
use App\Models\FieldSubmission;
use App\Models\MenuSection;
use App\Models\Restaurant;
use App\Models\User;
use App\Support\Field\ConfirmationMessage;
use App\Support\GeoPoint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

/**
 * La carta en la captura de campo (ADR 0049): se valida, se confirma por el
 * dueño con sus precios, y al aprobar se vuelve secciones y platos de la
 * ficha oculta.
 *
 * @return array<string, mixed>
 */
function menuMenu(): array
{
    return [
        [
            'name_es' => 'Almuerzos', 'name_en' => null,
            'dishes' => [
                ['name_es' => 'Bandeja paisa', 'name_en' => null, 'price' => 22000, 'is_alcohol' => false, 'catalog_variant_id' => null],
                ['name_es' => 'Sancocho', 'name_en' => 'Sancocho stew', 'price' => 18000, 'is_alcohol' => false, 'catalog_variant_id' => null],
            ],
        ],
        [
            'name_es' => 'Cervezas', 'name_en' => 'Beers',
            'dishes' => [
                ['name_es' => 'Cerveza Águila Botella 330 ml', 'name_en' => null, 'price' => 4500, 'is_alcohol' => true, 'catalog_variant_id' => null],
            ],
        ],
    ];
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function menuData(array $menu, array $overrides = []): array
{
    return array_merge([
        'payload' => [
            'name' => 'Sazón del Parque',
            'category_ids' => [Category::factory()->create()->id],
            'address' => 'Carrera 8 # 10-20',
            'reference' => null,
            'phone' => null,
            'whatsapp' => '573001112233',
            'delivery' => false,
            'payment_methods' => ['cash'],
            'hours' => [['weekday' => 1, 'opens' => '11:00', 'closes' => '15:00']],
            'menu' => $menu,
        ],
        'latitude' => 4.4120,
        'longitude' => -76.1540,
        'location_source' => 'device',
        'owner_name' => 'Marta Ríos',
        'owner_role' => 'owner',
        'owner_phone' => '573004445566',
        'captured_at' => Carbon::now()->subMinutes(3),
        'restaurant_id' => null,
        'distinct_from' => [],
    ], $overrides);
}

function menuConfirmed(User $admin, array $menu): FieldSubmission
{
    $submission = app(ReceiveFieldSubmission::class)->handle($admin, (string) Str::uuid(), menuData($menu))['submission'];
    $code = app(IssueConfirmationLink::class)->handle($submission, $admin);
    app(ConfirmFieldSubmission::class)->handle($code, $submission->contentHash());

    return $submission->refresh();
}

test('aprobar crea las secciones y los platos de la carta en la ficha oculta, con su orden y su alcohol', function () {
    $admin = User::factory()->admin()->create();
    $submission = menuConfirmed($admin, menuMenu());

    $restaurant = app(ApproveFieldSubmission::class)->handle($submission, $admin)->refresh();
    $sections = $restaurant->menuSections()->orderBy('position')->get();

    expect($restaurant->status)->toBe(RestaurantStatus::Hidden)
        ->and($sections->pluck('name_es')->all())->toBe(['Almuerzos', 'Cervezas'])
        ->and($sections->pluck('position')->all())->toBe([0, 1])
        ->and($sections[1]->name_en)->toBe('Beers')
        ->and($sections[0]->dishes->pluck('name_es')->all())->toBe(['Bandeja paisa', 'Sancocho'])
        ->and($sections[0]->dishes->pluck('price')->all())->toBe([22000, 18000])
        ->and($sections[0]->dishes->pluck('is_alcohol')->all())->toBe([false, false])
        ->and($sections[1]->dishes->first()?->is_alcohol)->toBeTrue()
        ->and($sections[1]->dishes->first()?->restaurant_id)->toBe($restaurant->id)
        ->and($sections[0]->counts_for_price_range)->toBeTrue()
        ->and($sections[1]->counts_for_price_range)->toBeFalse();
});

test('el inglés de un plato de catálogo sale del catálogo si el teléfono no lo mandó', function () {
    $item = CatalogItem::factory()->create(['group_id' => CatalogGroup::factory(), 'brand' => 'Postobón', 'name_es' => 'Manzana', 'name_en' => 'Apple']);
    $variant = CatalogVariant::factory()->create(['item_id' => $item->id, 'label' => '400 ml']);
    $admin = User::factory()->admin()->create();

    $submission = menuConfirmed($admin, [[
        'name_es' => 'Bebidas', 'name_en' => 'Drinks',
        'dishes' => [['name_es' => 'Manzana Postobón 400 ml', 'name_en' => null, 'price' => 3500, 'is_alcohol' => false, 'catalog_variant_id' => $variant->id]],
    ]]);

    $dish = app(ApproveFieldSubmission::class)->handle($submission, $admin)->dishes()->firstOrFail();

    expect($dish->name_es)->toBe('Manzana Postobón 400 ml')
        ->and($dish->name_en)->toBe('Apple Postobón 400 ml');
});

test('una captura sin carta (la etapa 1) se aprueba igual y no crea secciones', function () {
    $admin = User::factory()->admin()->create();
    $submission = menuConfirmed($admin, []);

    $restaurant = app(ApproveFieldSubmission::class)->handle($submission, $admin);

    expect($restaurant->menuSections()->count())->toBe(0);
});

test('completar una ficha que ya tiene carta se rechaza: cambiarla es la etapa 3', function () {
    $admin = User::factory()->admin()->create();
    $draft = Restaurant::factory()->hidden()->create(['name' => 'Sazon del parque', 'location' => new GeoPoint(4.4121, -76.1540)]);
    MenuSection::factory()->create(['restaurant_id' => $draft->id]);

    $data = menuData(menuMenu(), ['restaurant_id' => $draft->id]);
    $submission = app(ReceiveFieldSubmission::class)->handle($admin, (string) Str::uuid(), $data)['submission'];
    app(ConfirmFieldSubmission::class)->handle(app(IssueConfirmationLink::class)->handle($submission, $admin), $submission->contentHash());

    expect(fn () => app(ApproveFieldSubmission::class)->handle($submission->refresh(), $admin))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::MENU_EXISTS);
    expect($draft->menuSections()->count())->toBe(1);
});

test('la carta entra en la huella: cambiar un precio después de la confirmación impide aprobar', function () {
    $admin = User::factory()->admin()->create();
    $submission = menuConfirmed($admin, menuMenu());

    $payload = $submission->payload;
    $payload['menu'][0]['dishes'][0]['price'] = 1;
    $submission->forceFill(['payload' => $payload])->save();

    expect(fn () => app(ApproveFieldSubmission::class)->handle($submission, $admin))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::CONTENT_CHANGED);
    expect(Restaurant::query()->count())->toBe(0);
});

/**
 * @param  array<string, mixed>  $menu
 * @return array<string, mixed>
 */
function menuBody(array $menu): array
{
    return [
        'name' => 'Sazón del Parque', 'category_ids' => [Category::factory()->create()->id], 'address' => 'Carrera 8 # 10-20',
        'reference' => '', 'phone' => '', 'whatsapp' => '', 'delivery' => true, 'payment_methods' => [],
        'hours' => [], 'latitude' => 4.412, 'longitude' => -76.154, 'location_source' => 'device',
        'owner_name' => 'Marta Ríos', 'owner_role' => 'owner', 'owner_phone' => '3004445566',
        'captured_at' => now()->toIso8601String(), 'menu' => $menu,
    ];
}

test('el servidor guarda la carta recortada y con el precio entero, y la versión del contenido es la 2', function () {
    $admin = User::factory()->admin()->create();
    $this->actingAs($admin);
    $uuid = (string) Str::uuid();

    $menu = [['name_es' => '  Almuerzos ', 'name_en' => '', 'dishes' => [['name_es' => ' Sancocho ', 'name_en' => ' ', 'price' => 18000, 'is_alcohol' => false]]]];
    $this->putJson("/campo/api/submissions/{$uuid}", menuBody($menu))->assertCreated();

    $submission = FieldSubmission::query()->firstOrFail();

    expect($submission->payload_version)->toBe(2)
        ->and($submission->payload['menu'])->toEqual([[
            'name_es' => 'Almuerzos', 'name_en' => null,
            'dishes' => [['name_es' => 'Sancocho', 'name_en' => null, 'price' => 18000, 'is_alcohol' => false, 'catalog_variant_id' => null]],
        ]]);
});

test('la carta inválida se rechaza con 422 y el campo que falló', function (array $menu, string $field) {
    $this->actingAs(User::factory()->admin()->create());

    $this->putJson('/campo/api/submissions/'.Str::uuid(), menuBody($menu))
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);

    expect(FieldSubmission::query()->count())->toBe(0);
})->with([
    'precio negativo' => [[['name_es' => 'A', 'dishes' => [['name_es' => 'B', 'price' => -1]]]], 'menu.0.dishes.0.price'],
    'precio decimal' => [[['name_es' => 'A', 'dishes' => [['name_es' => 'B', 'price' => 10.5]]]], 'menu.0.dishes.0.price'],
    'precio por las nubes' => [[['name_es' => 'A', 'dishes' => [['name_es' => 'B', 'price' => 10_000_000]]]], 'menu.0.dishes.0.price'],
    'precio como texto' => [[['name_es' => 'A', 'dishes' => [['name_es' => 'B', 'price' => 'mucho']]]], 'menu.0.dishes.0.price'],
    'sección sin platos' => [[['name_es' => 'A', 'dishes' => []]], 'menu.0.dishes'],
    'sección sin nombre' => [[['name_es' => ' ', 'dishes' => [['name_es' => 'B', 'price' => 1]]]], 'menu.0.name_es'],
    'plato con un control' => [[['name_es' => 'A', 'dishes' => [['name_es' => "B\0B", 'price' => 1]]]], 'menu.0.dishes.0.name_es'],
    'secciones repetidas' => [[['name_es' => 'Bebidas', 'dishes' => [['name_es' => 'A', 'price' => 1]]], ['name_es' => ' bebidas ', 'dishes' => [['name_es' => 'B', 'price' => 1]]]], 'menu'],
    'platos repetidos en una sección' => [[['name_es' => 'A', 'dishes' => [['name_es' => 'Sopa', 'price' => 1], ['name_es' => 'SOPA ', 'price' => 2]]]], 'menu'],
    'una presentación que no existe' => [[['name_es' => 'A', 'dishes' => [['name_es' => 'B', 'price' => 1, 'catalog_variant_id' => 999999]]]], 'menu.0.dishes.0.catalog_variant_id'],
    'la carta como texto' => [['no'], 'menu.0.name_es'],
]);

test('una presentación desactivada del catálogo no se acepta', function () {
    $this->actingAs(User::factory()->admin()->create());
    $variant = CatalogVariant::factory()->create(['active' => false]);

    $this->putJson('/campo/api/submissions/'.Str::uuid(), menuBody([['name_es' => 'A', 'dishes' => [['name_es' => 'B', 'price' => 1, 'catalog_variant_id' => $variant->id]]]]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('menu.0.dishes.0.catalog_variant_id');
});

test('los límites: doce secciones, sesenta platos por sección y trescientos en total', function () {
    $this->actingAs(User::factory()->admin()->create());

    $section = fn (int $n, int $dishes): array => ['name_es' => "Sección {$n}", 'dishes' => array_map(fn (int $d): array => ['name_es' => "Plato {$n}-{$d}", 'price' => 1000], range(1, $dishes))];

    $this->putJson('/campo/api/submissions/'.Str::uuid(), menuBody(array_map(fn (int $n): array => $section($n, 1), range(1, 13))))->assertUnprocessable()->assertJsonValidationErrors('menu');
    $this->putJson('/campo/api/submissions/'.Str::uuid(), menuBody([$section(1, 61)]))->assertUnprocessable()->assertJsonValidationErrors('menu.0.dishes');
    $this->putJson('/campo/api/submissions/'.Str::uuid(), menuBody(array_map(fn (int $n): array => $section($n, 26), range(1, 12))))->assertUnprocessable()->assertJsonValidationErrors('menu');
    $this->putJson('/campo/api/submissions/'.Str::uuid(), menuBody(array_map(fn (int $n): array => $section($n, 25), range(1, 12))))->assertCreated();
});

test('/campo/api/me trae el catálogo activo con una versión que cambia solo si cambia el catálogo', function () {
    $group = CatalogGroup::factory()->create(['name_es' => 'Gaseosas']);
    $item = CatalogItem::factory()->create(['group_id' => $group->id, 'brand' => 'Postobón', 'name_es' => 'Manzana']);
    CatalogVariant::factory()->create(['item_id' => $item->id, 'label' => '400 ml']);
    CatalogVariant::factory()->create(['item_id' => $item->id, 'label' => '1,5 L', 'active' => false, 'position' => 1]);
    CatalogItem::factory()->create(['group_id' => $group->id, 'active' => false]);
    CatalogGroup::factory()->create(['active' => false]);

    $this->actingAs(User::factory()->admin()->create());

    $first = $this->getJson('/campo/api/me')->assertOk()->json('catalog');
    $again = $this->getJson('/campo/api/me')->json('catalog');

    expect($first['groups'])->toHaveCount(1)
        ->and($first['groups'][0]['items'])->toHaveCount(1)
        ->and(array_column($first['groups'][0]['items'][0]['variants'], 'label'))->toBe(['400 ml'])
        ->and($first['groups'][0]['section_name_es'])->toBe('Bebidas')
        ->and($first['version'])->toBeString()->not->toBeEmpty()
        ->and($again['version'])->toBe($first['version']);

    $item->forceFill(['name_es' => 'Manzana verde'])->save();

    expect($this->getJson('/campo/api/me')->json('catalog.version'))->not->toBe($first['version']);
});

test('el catálogo solo llega a administración', function () {
    CatalogGroup::factory()->create();

    $this->getJson('/campo/api/me')->assertUnauthorized();

    $this->actingAs(User::factory()->create());
    $this->getJson('/campo/api/me')->assertForbidden();
});

test('la página del dueño muestra la carta con sus precios y el aviso de alcohol, y el mensaje de WhatsApp la resume', function () {
    $this->withoutVite();
    $admin = User::factory()->admin()->create();
    $submission = app(ReceiveFieldSubmission::class)->handle($admin, (string) Str::uuid(), menuData(menuMenu()))['submission'];
    $code = app(IssueConfirmationLink::class)->handle($submission, $admin);

    $this->get("/confirmar/{$code}")
        ->assertOk()
        ->assertSee('Carta y precios')
        ->assertSee('Almuerzos')
        ->assertSee('Bandeja paisa')
        ->assertSee('$22.000', false)
        ->assertSee('$4.500', false)
        ->assertSee('+18')
        ->assertSee('Bebida alcohólica: solo para mayores de 18 años.');

    $text = ConfirmationMessage::text($submission->refresh(), 'https://x.test/confirmar/abc');

    expect($text)->toContain('Carta: 3 platos en 2 secciones')->not->toContain('Bandeja paisa');
});

test('sin alcohol en la carta, la página del dueño no muestra el aviso', function () {
    $this->withoutVite();
    $admin = User::factory()->admin()->create();
    $menu = [['name_es' => 'Almuerzos', 'name_en' => null, 'dishes' => [['name_es' => 'Sancocho', 'name_en' => null, 'price' => 18000, 'is_alcohol' => false, 'catalog_variant_id' => null]]]];
    $submission = app(ReceiveFieldSubmission::class)->handle($admin, (string) Str::uuid(), menuData($menu))['submission'];
    $code = app(IssueConfirmationLink::class)->handle($submission, $admin);

    $this->get("/confirmar/{$code}")->assertOk()->assertSee('Sancocho')->assertDontSee('mayores de 18');
});

test('una captura sin carta no muestra la sección en la página del dueño', function () {
    $this->withoutVite();
    $admin = User::factory()->admin()->create();
    $submission = app(ReceiveFieldSubmission::class)->handle($admin, (string) Str::uuid(), menuData([]))['submission'];
    $code = app(IssueConfirmationLink::class)->handle($submission, $admin);

    $this->get("/confirmar/{$code}")->assertOk()->assertDontSee('Carta y precios');
});

test('la revisión en /admin muestra la carta, los precios y el +18', function () {
    $admin = User::factory()->admin()->create();
    $submission = app(ReceiveFieldSubmission::class)->handle($admin, (string) Str::uuid(), menuData(menuMenu()))['submission'];

    $html = FieldSubmissionResource::details($submission)->render();

    expect($html)->toContain('Almuerzos')
        ->toContain('Bandeja paisa · $22.000')
        ->toContain('Cerveza Águila Botella 330 ml · $4.500 · +18');
});

test('devolver una captura con carta la deja editable con su contenido, carta incluida', function () {
    $admin = User::factory()->admin()->create();
    $this->actingAs($admin);
    $submission = app(ReceiveFieldSubmission::class)->handle($admin, (string) Str::uuid(), menuData(menuMenu()))['submission'];
    app(CloseFieldSubmission::class)->sendBack($submission, $admin, 'Falta un precio');

    $content = collect($this->getJson('/campo/api/submissions')->json('submissions'))->firstWhere('uuid', $submission->uuid)['content'];

    expect($content['menu'])->toHaveCount(2)
        ->and($content['menu'][0]['dishes'][0]['price'])->toBe(22000);
});
