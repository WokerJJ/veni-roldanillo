<?php

use App\Actions\Restaurants\ActionRefused;
use App\Actions\Restaurants\ApproveFieldSubmission;
use App\Actions\Restaurants\CloseFieldSubmission;
use App\Actions\Restaurants\ConfirmFieldSubmission;
use App\Actions\Restaurants\IssueConfirmationLink;
use App\Actions\Restaurants\PublishRestaurant;
use App\Actions\Restaurants\ReceiveFieldSubmission;
use App\Enums\FieldSubmissionStatus;
use App\Enums\LegalDocument;
use App\Enums\RestaurantStatus;
use App\Models\Category;
use App\Models\FieldSubmission;
use App\Models\Restaurant;
use App\Models\RestaurantSource;
use App\Models\User;
use App\Support\GeoPoint;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

/**
 * El modo Campo de punta a punta, sin HTTP (ADR 0048): recibir de forma
 * idempotente, el enlace de un solo uso, la confirmación del dueño y la
 * aprobación que crea la ficha oculta.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function fieldData(array $overrides = []): array
{
    return array_merge([
        'payload' => [
            'name' => 'Sazón del Parque',
            'category_ids' => [Category::factory()->create()->id],
            'address' => 'Carrera 8 # 10-20',
            'reference' => 'Junto a la iglesia',
            'phone' => null,
            'whatsapp' => '573001112233',
            'delivery' => false,
            'payment_methods' => ['cash'],
            'hours' => [
                ['weekday' => 1, 'opens' => '11:00', 'closes' => '15:00'],
                ['weekday' => 1, 'opens' => '18:00', 'closes' => '23:00'],
            ],
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

function fieldOsmSource(Restaurant $restaurant): void
{
    DB::table('restaurant_sources')->insert([
        'restaurant_id' => $restaurant->id, 'source' => RestaurantSource::OPENSTREETMAP, 'element_type' => 'node',
        'element_id' => $restaurant->id, 'element_kind' => 'amenity=cafe', 'fetched_at' => now(),
        'imported_hash' => str_repeat('a', 64),
    ]);
}

function receive(User $user, ?string $uuid = null, array $data = []): FieldSubmission
{
    return app(ReceiveFieldSubmission::class)->handle($user, $uuid ?? (string) Str::uuid(), fieldData($data))['submission'];
}

function confirmedSubmission(User $admin, array $data = []): FieldSubmission
{
    $submission = receive($admin, null, $data);
    $code = app(IssueConfirmationLink::class)->handle($submission, $admin);
    app(ConfirmFieldSubmission::class)->handle($code);

    return $submission->refresh();
}

test('recibir guarda la captura enviada con la hora del servidor y sin tocar fichas', function () {
    $admin = User::factory()->admin()->create();

    $result = app(ReceiveFieldSubmission::class)->handle($admin, $uuid = (string) Str::uuid(), fieldData());
    $submission = $result['submission']->refresh();

    expect($result['created'])->toBeTrue()
        ->and($submission->uuid)->toBe($uuid)
        ->and($submission->status)->toBe(FieldSubmissionStatus::Submitted)
        ->and($submission->captured_by)->toBe($admin->id)
        ->and($submission->revision)->toBe(1)
        ->and($submission->location->latitude)->toBe(4.412)
        ->and($submission->payload_hash)->toBe($submission->contentHash())
        ->and(Restaurant::query()->count())->toBe(0);
});

test('repetir el envío con el mismo contenido no duplica y devuelve la misma captura', function () {
    $admin = User::factory()->admin()->create();
    $uuid = (string) Str::uuid();
    $data = fieldData();

    $first = app(ReceiveFieldSubmission::class)->handle($admin, $uuid, $data);
    $again = app(ReceiveFieldSubmission::class)->handle($admin, $uuid, $data);

    expect($first['created'])->toBeTrue()
        ->and($again['created'])->toBeFalse()
        ->and($again['submission']->id)->toBe($first['submission']->id)
        ->and(FieldSubmission::query()->count())->toBe(1);
});

test('el mismo identificador con otro contenido se rechaza y no pisa lo enviado', function () {
    $admin = User::factory()->admin()->create();
    $uuid = (string) Str::uuid();
    app(ReceiveFieldSubmission::class)->handle($admin, $uuid, fieldData());

    $other = fieldData();
    $other['payload']['name'] = 'Otro nombre';

    expect(fn () => app(ReceiveFieldSubmission::class)->handle($admin, $uuid, $other))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::CONTENT_CONFLICT);
    expect(FieldSubmission::query()->firstOrFail()->payload['name'])->toBe('Sazón del Parque');
});

test('el identificador de otra cuenta no se puede usar y quien no es administración no captura', function () {
    $admin = User::factory()->admin()->create();
    $uuid = (string) Str::uuid();
    app(ReceiveFieldSubmission::class)->handle($admin, $uuid, fieldData());

    $otherAdmin = User::factory()->admin()->create();

    expect(fn () => app(ReceiveFieldSubmission::class)->handle($otherAdmin, $uuid, fieldData()))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::NOT_YOURS);
    expect(fn () => app(ReceiveFieldSubmission::class)->handle(User::factory()->create(), (string) Str::uuid(), fieldData()))
        ->toThrow(AuthorizationException::class);
});

test('recibir guarda los duplicados que encuentra: ficha cercana y borrador de OpenStreetMap', function () {
    $admin = User::factory()->admin()->create();
    $near = Restaurant::factory()->create(['name' => 'Otro Nombre Distinto', 'location' => new GeoPoint(4.41205, -76.1540)]);
    $draft = Restaurant::factory()->hidden()->create(['name' => 'Sazon del parque', 'location' => new GeoPoint(4.4180, -76.1560)]);
    fieldOsmSource($draft);
    Restaurant::factory()->create(['name' => 'Lejos y distinto', 'location' => new GeoPoint(4.4090, -76.1590)]);

    $candidates = collect(receive($admin)->duplicates['candidates'])->keyBy('restaurant_id');

    expect($candidates->keys()->all())->toEqualCanonicalizing([$near->id, $draft->id])
        ->and($candidates[$near->id]['distance_m'])->toBeLessThan(50)
        ->and($candidates[$draft->id]['from_osm'])->toBeTrue();
});

test('el enlace guarda solo el hash, y pedir otro invalida el anterior', function () {
    $admin = User::factory()->admin()->create();
    $submission = receive($admin);

    $first = app(IssueConfirmationLink::class)->handle($submission, $admin);
    $second = app(IssueConfirmationLink::class)->handle($submission, $admin);

    $row = $submission->refresh();

    expect($first)->toHaveLength(43)->not->toBe($second)
        ->and($row->confirmation_token_hash)->toBe(FieldSubmission::hashCode($second))
        ->and(DB::table('field_submissions')->where('confirmation_token_hash', $first)->exists())->toBeFalse()
        ->and(FieldSubmission::awaitingCode($first))->toBeNull()
        ->and(FieldSubmission::awaitingCode($second)?->id)->toBe($submission->id)
        ->and($row->confirmation_expires_at?->isFuture())->toBeTrue()
        ->and($row->confirmation_phone)->toBe('573004445566');
});

test('solo quien capturó pide el enlace, y solo mientras espera', function () {
    $admin = User::factory()->admin()->create();
    $submission = receive($admin);

    expect(fn () => app(IssueConfirmationLink::class)->handle($submission, User::factory()->admin()->create()))
        ->toThrow(AuthorizationException::class);

    app(CloseFieldSubmission::class)->reject($submission, $admin, 'No existe');

    expect(fn () => app(IssueConfirmationLink::class)->handle($submission->refresh(), $admin))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::NOT_OPEN);
});

test('confirmar registra fecha, versiones, celular y huella, y consume el código', function () {
    $admin = User::factory()->admin()->create();
    $submission = receive($admin);
    $code = app(IssueConfirmationLink::class)->handle($submission, $admin);

    $confirmed = app(ConfirmFieldSubmission::class)->handle($code, $submission->payload_hash);

    expect($confirmed->status)->toBe(FieldSubmissionStatus::OwnerConfirmed)
        ->and($confirmed->owner_confirmed_at)->not->toBeNull()
        ->and($confirmed->owner_confirmed_hash)->toBe($submission->payload_hash)
        ->and($confirmed->owner_privacy_notice_version)->toBe(LegalDocument::PRIVACY_VERSION)
        ->and($confirmed->owner_authorization_version)->toBe(FieldSubmission::AUTHORIZATION_VERSION)
        ->and($confirmed->confirmation_phone)->toBe('573004445566')
        ->and($confirmed->confirmation_token_hash)->toBeNull();

    expect(fn () => app(ConfirmFieldSubmission::class)->handle($code))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::CODE_INVALID);
});

test('un código inventado, vencido o de otra captura falla igual', function () {
    $admin = User::factory()->admin()->create();
    $submission = receive($admin);
    $code = app(IssueConfirmationLink::class)->handle($submission, $admin);

    $this->travel(FieldSubmission::CONFIRMATION_DAYS + 1)->days();

    foreach ([$code, 'no-es-un-codigo', str_repeat('a', 43)] as $bad) {
        expect(fn () => app(ConfirmFieldSubmission::class)->handle($bad))
            ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::CODE_INVALID);
    }

    expect($submission->refresh()->status)->toBe(FieldSubmissionStatus::Submitted);
});

test('si el contenido cambió respecto a lo que el dueño vio, no se confirma', function () {
    $admin = User::factory()->admin()->create();
    $submission = receive($admin);
    $code = app(IssueConfirmationLink::class)->handle($submission, $admin);

    expect(fn () => app(ConfirmFieldSubmission::class)->handle($code, str_repeat('0', 64)))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::CONTENT_CHANGED);
});

test('aprobar crea la ficha OCULTA y verificada con categorías, horarios y quién la capturó', function () {
    $admin = User::factory()->admin()->create();
    $submission = confirmedSubmission($admin);

    $restaurant = app(ApproveFieldSubmission::class)->handle($submission, $admin);

    $restaurant->refresh();
    $submission->refresh();

    expect($restaurant->status)->toBe(RestaurantStatus::Hidden)
        ->and($restaurant->verified_at)->not->toBeNull()
        ->and($restaurant->slug)->toBe('sazon-del-parque')
        ->and($restaurant->name)->toBe('Sazón del Parque')
        ->and($restaurant->whatsapp)->toBe('573001112233')
        ->and($restaurant->location->latitude)->toBe(4.412)
        ->and($restaurant->categories()->count())->toBe(1)
        ->and($restaurant->openingHours()->count())->toBe(2)
        ->and($submission->status)->toBe(FieldSubmissionStatus::Approved)
        ->and($submission->restaurant_id)->toBe($restaurant->id)
        ->and($submission->captured_by)->toBe($admin->id)
        ->and($submission->reviewed_at)->not->toBeNull();

    // Se publica con la acción de siempre, sin pedir la verificación otra vez.
    expect(app(PublishRestaurant::class)->handle($restaurant))->toBe(RestaurantStatus::Unclaimed);
});

test('sin la confirmación del dueño no se aprueba, y la base lo impide aunque se fuerce', function () {
    $admin = User::factory()->admin()->create();
    $submission = receive($admin);

    expect(fn () => app(ApproveFieldSubmission::class)->handle($submission, $admin))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::NOT_CONFIRMED);
    expect(Restaurant::query()->count())->toBe(0);

    expect(fn () => DB::table('field_submissions')->where('id', $submission->id)->update(['status' => 'approved', 'reviewed_at' => now()]))
        ->toThrow(QueryException::class);
    expect(fn () => DB::table('field_submissions')->where('id', $submission->id)->update(['status' => 'owner_confirmed']))
        ->toThrow(QueryException::class);
});

test('si el contenido cambió después de la confirmación, no se aprueba', function () {
    $admin = User::factory()->admin()->create();
    $submission = confirmedSubmission($admin);

    $payload = $submission->payload;
    $payload['name'] = 'Nombre cambiado a escondidas';
    $submission->forceFill(['payload' => $payload])->save();

    expect(fn () => app(ApproveFieldSubmission::class)->handle($submission, $admin))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::CONTENT_CHANGED);
    expect(Restaurant::query()->count())->toBe(0);
});

test('solo administración aprueba', function () {
    $admin = User::factory()->admin()->create();
    $submission = confirmedSubmission($admin);

    expect(fn () => app(ApproveFieldSubmission::class)->handle($submission, User::factory()->create()))
        ->toThrow(AuthorizationException::class);
});

test('con un duplicado sin resolver no se aprueba; declarar «otro negocio» lo destraba', function () {
    $admin = User::factory()->admin()->create();
    $existing = Restaurant::factory()->create(['name' => 'Sazón del Parque', 'location' => new GeoPoint(4.4120, -76.1540)]);
    $submission = confirmedSubmission($admin);

    expect(fn () => app(ApproveFieldSubmission::class)->handle($submission, $admin))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::DUPLICATES_UNRESOLVED);
    expect(Restaurant::query()->count())->toBe(1);

    $created = app(ApproveFieldSubmission::class)->handle($submission, $admin, [$existing->id]);

    expect($created->id)->not->toBe($existing->id)
        ->and($created->slug)->toBe('sazon-del-parque')
        ->and($submission->refresh()->duplicates['distinct_from'])->toBe([$existing->id]);
});

test('completar un borrador de OpenStreetMap lo usa en vez de crear otra ficha', function () {
    $admin = User::factory()->admin()->create();
    $draft = Restaurant::factory()->hidden()->create([
        'name' => 'Sazon del parque', 'whatsapp' => null,
        'location' => new GeoPoint(4.4121, -76.1540),
    ]);
    fieldOsmSource($draft);

    $submission = confirmedSubmission($admin, ['restaurant_id' => $draft->id]);
    $restaurant = app(ApproveFieldSubmission::class)->handle($submission, $admin);

    expect($restaurant->id)->toBe($draft->id)
        ->and(Restaurant::query()->count())->toBe(1)
        ->and($restaurant->refresh()->whatsapp)->toBe('573001112233')
        ->and($restaurant->status)->toBe(RestaurantStatus::Hidden)
        ->and($restaurant->verified_at)->not->toBeNull()
        ->and($restaurant->openingHours()->count())->toBe(2);
});

test('no se puede vincular una ficha publicada ni con dueño', function () {
    $admin = User::factory()->admin()->create();
    $published = Restaurant::factory()->create();

    expect(fn () => app(ReceiveFieldSubmission::class)->handle($admin, (string) Str::uuid(), fieldData(['restaurant_id' => $published->id])))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::INVALID_TARGET);
});

test('devolver exige motivo, borra la confirmación y deja reenviar como revisión nueva', function () {
    $admin = User::factory()->admin()->create();
    $submission = confirmedSubmission($admin);

    expect(fn () => app(CloseFieldSubmission::class)->sendBack($submission, $admin, '  '))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::MISSING_NOTE);

    app(CloseFieldSubmission::class)->sendBack($submission, $admin, 'El horario del sábado está mal');
    $submission->refresh();

    expect($submission->status)->toBe(FieldSubmissionStatus::Returned)
        ->and($submission->review_note)->toBe('El horario del sábado está mal')
        ->and($submission->owner_confirmed_at)->toBeNull()
        ->and($submission->owner_confirmed_hash)->toBeNull();

    $fixed = fieldData();
    $fixed['payload']['name'] = 'Sazón del Parque (corregido)';
    $result = app(ReceiveFieldSubmission::class)->handle($admin, $submission->uuid, $fixed);

    expect($result['created'])->toBeFalse()
        ->and($result['submission']->status)->toBe(FieldSubmissionStatus::Submitted)
        ->and($result['submission']->revision)->toBe(2)
        ->and(FieldSubmission::query()->count())->toBe(1);
});

test('rechazar es definitivo y no se puede aprobar después', function () {
    $admin = User::factory()->admin()->create();
    $submission = confirmedSubmission($admin);

    app(CloseFieldSubmission::class)->reject($submission, $admin, 'El local no existe');

    expect($submission->refresh()->status)->toBe(FieldSubmissionStatus::Rejected)
        ->and(fn () => app(ApproveFieldSubmission::class)->handle($submission, $admin))
        ->toThrow(fn (ActionRefused $e) => $e->reason === ActionRefused::NOT_OPEN);
});

test('devueltas y rechazadas se borran a los seis meses; las aprobadas se conservan', function () {
    $admin = User::factory()->admin()->create();
    $old = now()->subMonths(FieldSubmission::RETENTION_MONTHS)->subDay();

    $rejected = FieldSubmission::factory()->create(['status' => 'rejected', 'review_note' => 'no', 'reviewed_at' => $old]);
    $recent = FieldSubmission::factory()->create(['status' => 'returned', 'review_note' => 'no', 'reviewed_at' => now()]);
    $approved = FieldSubmission::factory()->confirmed()->create(['status' => 'approved', 'reviewed_at' => $old, 'restaurant_id' => Restaurant::factory()]);

    (new FieldSubmission)->pruneAll();

    expect(FieldSubmission::query()->whereKey($rejected->id)->exists())->toBeFalse()
        ->and(FieldSubmission::query()->whereKey($recent->id)->exists())->toBeTrue()
        ->and(FieldSubmission::query()->whereKey($approved->id)->exists())->toBeTrue();
});

test('el contacto del dueño no sale en la ficha pública, el GeoJSON ni las props de Inertia tras publicar', function () {
    $admin = User::factory()->admin()->create();
    $submission = confirmedSubmission($admin, ['owner_name' => 'Zacarias Privadez', 'owner_phone' => '573009876543']);

    $restaurant = app(ApproveFieldSubmission::class)->handle($submission, $admin);
    app(PublishRestaurant::class)->handle($restaurant);
    $slug = $restaurant->refresh()->slug;

    $html = $this->get("/restaurants/{$slug}")->assertOk()->getContent() ?: '';
    $inertia = '';
    $this->get("/restaurants/{$slug}")->assertInertia(function (Assert $page) use (&$inertia): void {
        $inertia = json_encode($page->toArray(), JSON_UNESCAPED_UNICODE) ?: '';
    });
    $geojson = $this->get('/api/restaurants.geojson')->assertOk()->getContent() ?: '';

    expect($geojson)->toContain('Sazón del Parque');

    foreach ([$html, $inertia, $geojson] as $surface) {
        expect($surface)->not->toContain('Zacarias')
            ->and($surface)->not->toContain('Privadez')
            ->and($surface)->not->toContain('573009876543')
            ->and($surface)->not->toContain('3009876543')
            ->and($surface)->not->toContain('owner_name')
            ->and($surface)->not->toContain('owner_phone');
    }
});
