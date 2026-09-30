<?php

use App\Enums\RestaurantRole;
use App\Models\Restaurant;
use App\Models\User;
use App\Policies\RestaurantPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;

uses(RefreshDatabase::class);

function memberOf(Restaurant $restaurant, RestaurantRole $role): User
{
    $user = User::factory()->create();
    $restaurant->members()->attach($user, ['role' => $role->value]);

    return $user;
}

test('el dueño edita su restaurante', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $owner = memberOf($restaurant, RestaurantRole::Owner);

    expect(Gate::forUser($owner)->allows('update', $restaurant))->toBeTrue();
});

test('el dueño de un restaurante no edita otro (IDOR)', function () {
    $mine = Restaurant::factory()->claimed()->create();
    $other = Restaurant::factory()->claimed()->create();
    $owner = memberOf($mine, RestaurantRole::Owner);

    expect(Gate::forUser($owner)->denies('update', $other))->toBeTrue();
});

test('un empleado no edita la ficha', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $staff = memberOf($restaurant, RestaurantRole::Staff);

    expect(Gate::forUser($staff)->denies('update', $restaurant))->toBeTrue();
});

test('un usuario cualquiera no edita, no crea ni borra', function () {
    $restaurant = Restaurant::factory()->create();
    $user = User::factory()->create();
    $gate = Gate::forUser($user);

    expect($gate->denies('update', $restaurant))->toBeTrue()
        ->and($gate->denies('create', Restaurant::class))->toBeTrue()
        ->and($gate->denies('delete', $restaurant))->toBeTrue();
});

test('el administrador puede todo', function () {
    $restaurant = Restaurant::factory()->hidden()->create();
    $gate = Gate::forUser(User::factory()->admin()->create());

    expect($gate->allows('view', $restaurant))->toBeTrue()
        ->and($gate->allows('create', Restaurant::class))->toBeTrue()
        ->and($gate->allows('update', $restaurant))->toBeTrue()
        ->and($gate->allows('delete', $restaurant))->toBeTrue();
});

test('la Policy no ofrece restaurar ni borrar definitivo (no hay borrado lógico)', function () {
    expect(method_exists(RestaurantPolicy::class, 'restore'))->toBeFalse()
        ->and(method_exists(RestaurantPolicy::class, 'forceDelete'))->toBeFalse();
});

test('el dueño no borra su ficha (pide el retiro)', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $owner = memberOf($restaurant, RestaurantRole::Owner);

    expect(Gate::forUser($owner)->denies('delete', $restaurant))->toBeTrue();
});

test('una ficha publicada la ve cualquiera, también sin sesión', function () {
    $restaurant = Restaurant::factory()->create();

    expect(Gate::forUser(null)->allows('view', $restaurant))->toBeTrue()
        ->and(Gate::forUser(null)->allows('viewAny', Restaurant::class))->toBeTrue();
});

test('una ficha oculta solo la ven el administrador y la gente del restaurante', function () {
    $restaurant = Restaurant::factory()->hidden()->create();
    $staff = memberOf($restaurant, RestaurantRole::Staff);

    expect(Gate::forUser(null)->denies('view', $restaurant))->toBeTrue()
        ->and(Gate::forUser(User::factory()->create())->denies('view', $restaurant))->toBeTrue()
        ->and(Gate::forUser($staff)->allows('view', $restaurant))->toBeTrue();
});

test('la pertenencia se consulta en la base y no en relaciones cargadas', function () {
    $mine = Restaurant::factory()->create();
    $other = Restaurant::factory()->create();
    $owner = memberOf($mine, RestaurantRole::Owner);

    // Una relación manipulada en memoria no concede permisos.
    $owner->setRelation('restaurants', collect([$other]));

    expect(Gate::forUser($owner)->denies('update', $other))->toBeTrue();
});
