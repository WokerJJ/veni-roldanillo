<?php

/*
| Regla de producto 5 para todo lo que cuelga de un restaurante: la Policy de
| cada modelo delega en RestaurantPolicy a través del restaurante dueño.
*/

use App\Enums\RestaurantRole;
use App\Models\DailyMenu;
use App\Models\DeliveryZone;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\OpeningHour;
use App\Models\Option;
use App\Models\OptionGroup;
use App\Models\Promotion;
use App\Models\Restaurant;
use App\Models\SpecialHour;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;

uses(RefreshDatabase::class);

dataset('contenido del restaurante', [
    'sección' => [MenuSection::class],
    'plato' => [Dish::class],
    'grupo de opciones' => [OptionGroup::class],
    'opción' => [Option::class],
    'almuerzo del día' => [DailyMenu::class],
    'promoción' => [Promotion::class],
    'horario' => [OpeningHour::class],
    'horario especial' => [SpecialHour::class],
    'zona de domicilio' => [DeliveryZone::class],
]);

/**
 * @param  class-string<Model>  $class
 */
function contentOf(string $class, Restaurant $restaurant): Model
{
    $section = fn () => MenuSection::factory()->for($restaurant);
    $dish = fn () => Dish::factory()->for($section());
    $group = fn () => OptionGroup::factory()->for($dish());

    return match ($class) {
        MenuSection::class => $section()->create(),
        Dish::class => $dish()->create(),
        OptionGroup::class => $group()->create(),
        Option::class => Option::factory()->for($group())->create(),
        default => $class::factory()->for($restaurant)->create(),
    };
}

function withRole(Restaurant $restaurant, RestaurantRole $role): User
{
    $user = User::factory()->create();
    $restaurant->members()->attach($user, ['role' => $role->value]);

    return $user;
}

test('el dueño crea, edita y borra el contenido de su restaurante', function (string $class) {
    $restaurant = Restaurant::factory()->claimed()->create();
    $content = contentOf($class, $restaurant);
    $gate = Gate::forUser(withRole($restaurant, RestaurantRole::Owner));

    expect($gate->allows('create', [$class, $restaurant]))->toBeTrue()
        ->and($gate->allows('update', $content))->toBeTrue()
        ->and($gate->allows('delete', $content))->toBeTrue();
})->with('contenido del restaurante');

test('el dueño de otro restaurante no toca el contenido (IDOR)', function (string $class) {
    $restaurant = Restaurant::factory()->claimed()->create();
    $content = contentOf($class, $restaurant);
    $gate = Gate::forUser(withRole(Restaurant::factory()->claimed()->create(), RestaurantRole::Owner));

    expect($gate->denies('create', [$class, $restaurant]))->toBeTrue()
        ->and($gate->denies('update', $content))->toBeTrue()
        ->and($gate->denies('delete', $content))->toBeTrue();
})->with('contenido del restaurante');

test('un empleado o un usuario cualquiera no editan el contenido', function (string $class) {
    $restaurant = Restaurant::factory()->claimed()->create();
    $content = contentOf($class, $restaurant);

    foreach ([withRole($restaurant, RestaurantRole::Staff), User::factory()->create()] as $user) {
        expect(Gate::forUser($user)->denies('update', $content))->toBeTrue()
            ->and(Gate::forUser($user)->denies('create', [$class, $restaurant]))->toBeTrue();
    }
})->with('contenido del restaurante');

test('el administrador edita el contenido de cualquier restaurante', function (string $class) {
    $restaurant = Restaurant::factory()->create();
    $content = contentOf($class, $restaurant);
    $gate = Gate::forUser(User::factory()->admin()->create());

    expect($gate->allows('create', [$class, $restaurant]))->toBeTrue()
        ->and($gate->allows('update', $content))->toBeTrue()
        ->and($gate->allows('delete', $content))->toBeTrue();
})->with('contenido del restaurante');

test('el contenido se ve si la ficha se ve', function (string $class) {
    $published = contentOf($class, Restaurant::factory()->create());
    $hidden = Restaurant::factory()->hidden()->create();
    $hiddenContent = contentOf($class, $hidden);

    expect(Gate::forUser(null)->allows('view', $published))->toBeTrue()
        ->and(Gate::forUser(null)->denies('view', $hiddenContent))->toBeTrue()
        ->and(Gate::forUser(withRole($hidden, RestaurantRole::Staff))->allows('view', $hiddenContent))->toBeTrue();
})->with('contenido del restaurante');
