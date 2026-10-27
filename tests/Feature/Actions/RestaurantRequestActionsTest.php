<?php

use App\Actions\Restaurants\ActionRefused;
use App\Actions\Restaurants\ApproveRemovalRequest;
use App\Actions\Restaurants\ApproveRestaurantClaim;
use App\Actions\Restaurants\RejectRestaurantRequest;
use App\Enums\ClaimStatus;
use App\Enums\RestaurantRole;
use App\Enums\RestaurantStatus;
use App\Models\Restaurant;
use App\Models\RestaurantClaim;
use App\Models\RestaurantRemovalRequest;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

/**
 * Aprobar y rechazar reclamos y retiros (#19, ADR 0026 y 0027): cada acción
 * va entera en una transacción y no deja nada a medias.
 */
function pendingClaim(?Restaurant $restaurant = null): RestaurantClaim
{
    return RestaurantClaim::factory()->withoutAccount()->create([
        'restaurant_id' => ($restaurant ?? Restaurant::factory()->create())->id,
        'contact_email' => 'dueno@example.test',
    ]);
}

test('aprobar un reclamo crea la cuenta, la hace dueña, reclama la ficha y marca la revisión', function () {
    $admin = User::factory()->admin()->create();
    $claim = pendingClaim();

    $result = app(ApproveRestaurantClaim::class)->handle($claim, $admin, '  Dueno@Example.test ');

    $claim->refresh();
    $restaurant = $claim->restaurant()->firstOrFail();
    $owner = $result->owner;

    expect($result->createdAccount())->toBeTrue()
        ->and($result->temporaryPassword)->toHaveLength(ApproveRestaurantClaim::TEMPORARY_PASSWORD_LENGTH)
        ->and(Hash::check((string) $result->temporaryPassword, $owner->password))->toBeTrue()
        ->and($owner->email)->toBe('dueno@example.test')
        ->and($owner->isAdmin())->toBeFalse()
        ->and($claim->status)->toBe(ClaimStatus::Approved)
        ->and($claim->user_id)->toBe($owner->id)
        ->and($claim->reviewed_by)->toBe($admin->id)
        ->and($claim->reviewed_at)->not->toBeNull()
        ->and($restaurant->status)->toBe(RestaurantStatus::Claimed)
        ->and($owner->fresh()?->ownsRestaurant($restaurant))->toBeTrue();
});

test('si ya hay una cuenta con ese correo, se vincula sin contraseña nueva; si era empleada, sube a dueña', function () {
    $admin = User::factory()->admin()->create();
    $restaurant = Restaurant::factory()->create();
    $existing = User::factory()->create(['email' => 'dueno@example.test']);
    $restaurant->members()->attach($existing, ['role' => RestaurantRole::Staff->value]);
    $hash = $existing->password;

    $result = app(ApproveRestaurantClaim::class)->handle(pendingClaim($restaurant), $admin, 'DUENO@example.test');

    expect($result->createdAccount())->toBeFalse()
        ->and($result->owner->id)->toBe($existing->id)
        ->and($existing->fresh()?->password)->toBe($hash)
        ->and(User::query()->count())->toBe(2)
        ->and($existing->fresh()?->ownsRestaurant($restaurant))->toBeTrue();
});

test('aprobar no deja nada a medias si la ficha ya no se puede reclamar', function (Closure $state) {
    $admin = User::factory()->admin()->create();
    $restaurant = Restaurant::factory()->create();
    $claim = pendingClaim($restaurant);
    $state($restaurant);
    $users = User::query()->count();

    expect(fn () => app(ApproveRestaurantClaim::class)->handle($claim, $admin, 'dueno@example.test'))
        ->toThrow(ActionRefused::class, ActionRefused::NOT_CLAIMABLE);

    expect($claim->fresh()?->status)->toBe(ClaimStatus::Pending)
        ->and($claim->fresh()?->user_id)->toBeNull()
        ->and(User::query()->count())->toBe($users);
})->with([
    'oculta' => [fn (Restaurant $r) => $r->forceFill(['status' => RestaurantStatus::Hidden])->save()],
    'ya reclamada por otro reclamo' => [function (Restaurant $r) {
        app(ApproveRestaurantClaim::class)->handle(pendingClaim($r), User::factory()->admin()->create(), 'otro@example.test');
    }],
]);

test('un reclamo ya resuelto no se aprueba ni se rechaza otra vez', function () {
    $admin = User::factory()->admin()->create();
    $claim = RestaurantClaim::factory()->withoutAccount()->rejected()->create();

    expect(fn () => app(ApproveRestaurantClaim::class)->handle($claim, $admin, 'x@example.test'))
        ->toThrow(ActionRefused::class, ActionRefused::NOT_PENDING)
        ->and(fn () => app(RejectRestaurantRequest::class)->handle($claim, $admin, 'Otra vez'))
        ->toThrow(ActionRefused::class, ActionRefused::NOT_PENDING);
});

test('una cuenta de administración no se vuelve dueña y un correo inválido no pasa', function () {
    $admin = User::factory()->admin()->create(['email' => 'admin@example.test']);
    $claim = pendingClaim();

    expect(fn () => app(ApproveRestaurantClaim::class)->handle($claim, $admin, 'admin@example.test'))
        ->toThrow(ActionRefused::class, ActionRefused::ADMIN_ACCOUNT)
        ->and(fn () => app(ApproveRestaurantClaim::class)->handle($claim, $admin, 'no es un correo'))
        ->toThrow(ActionRefused::class, ActionRefused::INVALID_EMAIL);

    expect($claim->fresh()?->status)->toBe(ClaimStatus::Pending);
});

test('solo administración aprueba o rechaza', function () {
    $owner = User::factory()->create();
    $claim = pendingClaim();
    $removal = RestaurantRemovalRequest::factory()->create();

    expect(fn () => app(ApproveRestaurantClaim::class)->handle($claim, $owner, 'x@example.test'))->toThrow(AuthorizationException::class)
        ->and(fn () => app(ApproveRemovalRequest::class)->handle($removal, $owner))->toThrow(AuthorizationException::class)
        ->and(fn () => app(RejectRestaurantRequest::class)->handle($claim, $owner, 'No'))->toThrow(AuthorizationException::class);

    expect($claim->fresh()?->status)->toBe(ClaimStatus::Pending)
        ->and($removal->fresh()?->status)->toBe(ClaimStatus::Pending);
});

test('rechazar guarda el motivo sin espacios a los lados y no cambia la ficha', function () {
    $admin = User::factory()->admin()->create();
    $claim = pendingClaim();

    app(RejectRestaurantRequest::class)->handle($claim, $admin, "\u{00A0} No pudimos confirmar que sea del negocio. \n");

    $claim->refresh();
    expect($claim->status)->toBe(ClaimStatus::Rejected)
        ->and($claim->review_note)->toBe('No pudimos confirmar que sea del negocio.')
        ->and($claim->reviewed_by)->toBe($admin->id)
        ->and($claim->restaurant()->firstOrFail()->status)->toBe(RestaurantStatus::Unclaimed);
});

test('rechazar sin motivo no se puede, ni con solo espacios', function (string $note) {
    $admin = User::factory()->admin()->create();
    $removal = RestaurantRemovalRequest::factory()->create();

    expect(fn () => app(RejectRestaurantRequest::class)->handle($removal, $admin, $note))
        ->toThrow(ActionRefused::class, ActionRefused::MISSING_NOTE);
    expect($removal->fresh()?->status)->toBe(ClaimStatus::Pending);
})->with(['vacío' => '', 'espacios' => "  \u{00A0}\t", 'largo' => str_repeat('a', 501)]);

test('la base exige el motivo en una rechazada', function () {
    $claim = pendingClaim();

    expect(fn () => $claim->forceFill(['status' => ClaimStatus::Rejected, 'reviewed_at' => now()])->save())
        ->toThrow(QueryException::class, 'restaurant_claims_rejection_has_note');
});

test('aprobar un retiro oculta la ficha y marca la revisión, en una transacción', function () {
    $admin = User::factory()->admin()->create();
    $restaurant = Restaurant::factory()->claimed()->create();
    $removal = RestaurantRemovalRequest::factory()->create(['restaurant_id' => $restaurant->id]);

    app(ApproveRemovalRequest::class)->handle($removal, $admin);

    expect($restaurant->fresh()?->status)->toBe(RestaurantStatus::Hidden)
        ->and($removal->fresh()?->status)->toBe(ClaimStatus::Approved)
        ->and($removal->fresh()?->reviewed_by)->toBe($admin->id);
});

test('aprobar un retiro ya resuelto no oculta la ficha', function () {
    $admin = User::factory()->admin()->create();
    $restaurant = Restaurant::factory()->create();
    $removal = RestaurantRemovalRequest::factory()->rejected()->create(['restaurant_id' => $restaurant->id]);

    expect(fn () => app(ApproveRemovalRequest::class)->handle($removal, $admin))
        ->toThrow(ActionRefused::class, ActionRefused::NOT_PENDING);
    expect($restaurant->fresh()?->status)->toBe(RestaurantStatus::Unclaimed);
});
