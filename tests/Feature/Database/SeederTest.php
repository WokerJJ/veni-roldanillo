<?php

use App\Models\Dish;
use App\Models\Neighborhood;
use App\Models\Restaurant;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

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

test('el seeder se niega a correr en producción', function () {
    app()->detectEnvironment(fn () => 'production');

    // Directo, sin el comando db:seed (que en producción pide confirmación).
    app(DatabaseSeeder::class)->run();
})->throws(RuntimeException::class, 'producción');
