<?php

use App\Models\DeliveryZone;
use App\Models\Dish;
use App\Models\Neighborhood;
use App\Models\Restaurant;
use App\Models\User;
use Database\Seeders\CategorySeeder;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\NeighborhoodSeeder;
use Database\Seeders\RestaurantSeeder;
use Database\Seeders\UserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

test('el seeder no deja restaurantes sin marcar como ficticios', function () {
    $this->seed(DatabaseSeeder::class);

    $restaurants = Restaurant::query()->get();

    expect($restaurants)->not->toBeEmpty()
        ->and($restaurants->where('is_fictitious', false))->toBeEmpty()
        ->and($restaurants->reject(fn (Restaurant $r) => str_ends_with($r->name, '(ficticio)')))->toBeEmpty();
});

test('el seeder no deja barrios sin marcar como ficticios', function () {
    $this->seed(DatabaseSeeder::class);

    $neighborhoods = Neighborhood::query()->get();

    expect($neighborhoods)->not->toBeEmpty()
        ->and($neighborhoods->where('is_fictitious', false))->toBeEmpty()
        ->and($neighborhoods->reject(fn (Neighborhood $n) => str_ends_with($n->name, '(ficticio)')))->toBeEmpty();
});

test('las coordenadas sembradas caen dentro del casco urbano de Roldanillo', function () {
    $this->seed(DatabaseSeeder::class);

    $outside = DB::scalar(
        'SELECT count(*) FROM restaurants WHERE NOT ST_Intersects(location, ST_MakeEnvelope(-76.1650, 4.4000, -76.1450, 4.4250, 4326)::geography)'
    );

    expect($outside)->toBe(0);
});

test('los números de WhatsApp sembrados no pueden pertenecer a nadie', function () {
    $this->seed(DatabaseSeeder::class);

    // En Colombia ningún número empieza por 0 después del indicativo 57.
    expect(Restaurant::query()->whereNotNull('whatsapp')->where('whatsapp', 'not like', '570%')->count())->toBe(0);
});

test('el seeder arma menús con opciones obligatorias y adiciones', function () {
    $this->seed(DatabaseSeeder::class);

    $dish = Dish::query()->whereHas('optionGroups', fn ($q) => $q->where('required', true))->firstOrFail();

    expect($dish->optionGroups()->where('required', false)->exists())->toBeTrue()
        ->and(Restaurant::query()->whereHas('owners')->count())->toBe(1);
});

test('ningún seeder corre fuera de local o testing', function (string $seeder, string $environment) {
    app()->detectEnvironment(fn () => $environment);

    // Directo, sin el comando db:seed (que en producción pide confirmación).
    app($seeder)->run();
})->with([
    DatabaseSeeder::class,
    CategorySeeder::class,
    NeighborhoodSeeder::class,
    UserSeeder::class,
    RestaurantSeeder::class,
])->with(['production', 'staging'])->throws(RuntimeException::class, 'ficticios');

test('el seeder no deja usuarios sin marcar como ficticios', function () {
    $this->seed(DatabaseSeeder::class);

    $users = User::query()->get();

    expect($users)->not->toBeEmpty()
        ->and($users->reject(fn (User $u) => str_ends_with($u->email, '@example.test')))->toBeEmpty()
        ->and($users->reject(fn (User $u) => str_ends_with($u->name, '(ficticio)')))->toBeEmpty();
});

test('las cuentas sembradas no tienen una contraseña conocida', function () {
    $this->seed(DatabaseSeeder::class);

    $known = User::query()->get()->filter(fn (User $u) => Hash::check('password', $u->password));

    expect($known)->toBeEmpty();
});

test('las zonas de domicilio sembradas son siempre las mismas', function () {
    $zones = fn () => DB::table('delivery_zones')
        ->join('restaurants', 'restaurants.id', '=', 'delivery_zones.restaurant_id')
        ->join('neighborhoods', 'neighborhoods.id', '=', 'delivery_zones.neighborhood_id')
        ->orderBy('restaurants.slug')->orderBy('neighborhoods.slug')
        ->get(['restaurants.slug as restaurant', 'neighborhoods.slug as neighborhood', 'delivery_zones.fee'])
        ->map(fn (object $zone) => (array) $zone)
        ->all();

    $this->seed(DatabaseSeeder::class);
    $first = $zones();

    Restaurant::query()->delete();
    User::query()->delete();
    $this->seed(DatabaseSeeder::class);

    expect($first)->not->toBeEmpty()
        ->and(DeliveryZone::query()->count())->toBe(count($first))
        ->and($zones())->toBe($first);
});
