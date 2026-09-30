<?php

use App\Enums\ClaimStatus;
use App\Enums\RestaurantPlan;
use App\Enums\RestaurantRole;
use App\Enums\RestaurantStatus;
use App\Enums\UserRole;
use App\Models\Category;
use App\Models\DailyMenu;
use App\Models\DeliveryZone;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Neighborhood;
use App\Models\OpeningHour;
use App\Models\Option;
use App\Models\OptionGroup;
use App\Models\OrderIntent;
use App\Models\Promotion;
use App\Models\Restaurant;
use App\Models\RestaurantClaim;
use App\Models\SpecialHour;
use App\Models\User;
use App\Support\GeoPoint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

test('un restaurante pertenece a una categoría y castea estado y plan a enums', function () {
    $category = Category::factory()->create();
    $restaurant = Restaurant::factory()->for($category)->create();

    $fresh = Restaurant::query()->findOrFail($restaurant->id);

    expect($fresh->category?->is($category))->toBeTrue()
        ->and($category->restaurants()->pluck('id')->all())->toBe([$restaurant->id])
        ->and($fresh->status)->toBe(RestaurantStatus::Unclaimed)
        ->and($fresh->plan)->toBe(RestaurantPlan::Free)
        ->and($fresh->payment_methods)->toBeArray();
});

test('la ubicación se guarda como geography y vuelve como GeoPoint', function () {
    $restaurant = Restaurant::factory()->create(['location' => new GeoPoint(4.4123, -76.1543)]);

    $fresh = Restaurant::query()->findOrFail($restaurant->id);
    $row = DB::selectOne('SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, ST_SRID(location::geometry) AS srid FROM restaurants WHERE id = ?', [$restaurant->id]);

    expect($fresh->location)->toEqual(new GeoPoint(4.4123, -76.1543))
        ->and((float) $row->lat)->toBe(4.4123)
        ->and((float) $row->lng)->toBe(-76.1543)
        ->and((int) $row->srid)->toBe(4326);
});

test('la ubicación permite buscar por distancia con PostGIS', function () {
    $near = Restaurant::factory()->create(['location' => new GeoPoint(4.4120, -76.1540)]);
    Restaurant::factory()->create(['location' => new GeoPoint(4.4300, -76.1800)]);

    $ids = Restaurant::query()
        ->whereRaw('ST_DWithin(location, ST_GeogFromText(?), 300)', ['SRID=4326;POINT(-76.1545 4.4122)'])
        ->pluck('id')->all();

    expect($ids)->toBe([$near->id]);
});

test('dueños y empleados se relacionan por restaurant_user con rol enum', function () {
    $restaurant = Restaurant::factory()->create();
    $owner = User::factory()->create();
    $staff = User::factory()->create();

    $restaurant->members()->attach($owner, ['role' => RestaurantRole::Owner->value]);
    $restaurant->members()->attach($staff, ['role' => RestaurantRole::Staff->value]);

    $membership = $owner->restaurants()->firstOrFail()->membership;

    expect($restaurant->members()->count())->toBe(2)
        ->and($restaurant->owners()->pluck('users.id')->all())->toBe([$owner->id])
        ->and($membership->role)->toBe(RestaurantRole::Owner)
        ->and($owner->ownsRestaurant($restaurant))->toBeTrue()
        ->and($staff->ownsRestaurant($restaurant))->toBeFalse()
        ->and($staff->worksAt($restaurant))->toBeTrue();
});

test('los usuarios nuevos son rol user con idioma es', function () {
    $user = User::factory()->create();

    expect($user->fresh()?->role)->toBe(UserRole::User)
        ->and(User::factory()->admin()->create()->isAdmin())->toBeTrue()
        ->and($user->isAdmin())->toBeFalse();
});

test('el menú encadena secciones, platos, grupos de opciones y opciones', function () {
    $section = MenuSection::factory()->create();
    $dish = Dish::factory()->for($section)->create();
    $group = OptionGroup::factory()->required()->for($dish)->create();
    $option = Option::factory()->for($group)->create(['price_delta' => 2000]);

    $restaurant = $section->restaurant;

    expect($dish->restaurant_id)->toBe($section->restaurant_id)
        ->and($restaurant->menuSections()->first()?->is($section))->toBeTrue()
        ->and($restaurant->dishes()->first()?->is($dish))->toBeTrue()
        ->and($section->dishes()->first()?->is($dish))->toBeTrue()
        ->and($dish->menuSection->is($section))->toBeTrue()
        ->and($dish->optionGroups()->first()?->is($group))->toBeTrue()
        ->and($group->dish->is($dish))->toBeTrue()
        ->and($group->options()->first()?->is($option))->toBeTrue()
        ->and($option->optionGroup->is($group))->toBeTrue()
        ->and($group->required)->toBeTrue()
        ->and($option->price_delta)->toBe(2000);
});

test('horarios, horarios especiales, almuerzo del día y promociones cuelgan del restaurante', function () {
    $restaurant = Restaurant::factory()->create();
    OpeningHour::factory()->for($restaurant)->create(['weekday' => 1]);
    SpecialHour::factory()->for($restaurant)->create();
    DailyMenu::factory()->for($restaurant)->create();
    Promotion::factory()->for($restaurant)->create();

    expect($restaurant->openingHours()->count())->toBe(1)
        ->and($restaurant->specialHours()->first()?->closed)->toBeTrue()
        ->and($restaurant->dailyMenus()->first()?->served_on?->isToday())->toBeTrue()
        ->and($restaurant->promotions()->count())->toBe(1);
});

test('los barrios con domicilio traen el costo en el pivote', function () {
    $restaurant = Restaurant::factory()->create();
    $neighborhood = Neighborhood::factory()->create();
    DeliveryZone::factory()->for($restaurant)->for($neighborhood)->create(['fee' => 3500]);

    $zone = $restaurant->neighborhoods()->firstOrFail()->zone;

    expect($zone->fee)->toBe(3500)
        ->and($neighborhood->restaurants()->first()?->is($restaurant))->toBeTrue()
        ->and($neighborhood->deliveryZones()->count())->toBe(1)
        ->and($restaurant->deliveryZones()->firstOrFail()->neighborhood->is($neighborhood))->toBeTrue();
});

test('reclamaciones e intenciones de pedido se relacionan con restaurante y usuario', function () {
    $admin = User::factory()->admin()->create();
    $claim = RestaurantClaim::factory()->approved($admin)->create();
    $intent = OrderIntent::factory()->for($claim->user)->create();

    expect($claim->status)->toBe(ClaimStatus::Approved)
        ->and($claim->reviewer?->is($admin))->toBeTrue()
        ->and($claim->restaurant->claims()->count())->toBe(1)
        ->and($claim->user->restaurantClaims()->count())->toBe(1)
        ->and($intent->user?->is($claim->user))->toBeTrue()
        ->and($intent->restaurant->orderIntents()->count())->toBe(1);
});

test('las fechas se guardan con zona horaria y vuelven iguales', function () {
    $this->travelTo(now()->setTime(23, 30));

    $restaurant = Restaurant::factory()->create();
    $stored = DB::selectOne('SELECT created_at AT TIME ZONE \'UTC\' AS utc FROM restaurants WHERE id = ?', [$restaurant->id]);

    expect($restaurant->fresh()?->created_at?->equalTo(now()))->toBeTrue()
        ->and($stored->utc)->toStartWith(now()->utc()->format('Y-m-d H:i'));
});
