<?php

use App\Enums\Fulfillment;
use App\Enums\RestaurantRole;
use App\Filament\Owner\Pages\Statistics;
use App\Models\OrderIntent;
use App\Models\Restaurant;
use App\Support\OrderIntentStats;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Livewire\Livewire;

/*
| Las estadísticas del dueño (#22, ADR 0031): /panel/{slug}/statistics, con
| los toques en «Enviar pedido por WhatsApp» de su ficha.
*/

uses(RefreshDatabase::class);

function intentAt(Restaurant $restaurant, string $at, Fulfillment $fulfillment = Fulfillment::Delivery): void
{
    OrderIntent::factory()->for($restaurant)->create([
        'fulfillment' => $fulfillment,
        'created_at' => CarbonImmutable::parse($at, 'America/Bogota'),
    ]);
}

test('el dueño ve sus estadísticas; otro dueño, un empleado o alguien sin sesión, no', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    $owner = panelMember($restaurant);
    $otherOwner = panelMember(Restaurant::factory()->claimed()->create());
    $staff = panelMember($restaurant, RestaurantRole::Staff);

    $this->get("/panel/{$restaurant->slug}/statistics")->assertRedirect('/panel/login');
    $this->actingAs($owner)->get("/panel/{$restaurant->slug}/statistics")->assertOk()->assertSee(__('panel.stats.heading'));
    $this->actingAs($otherOwner)->get("/panel/{$restaurant->slug}/statistics")->assertNotFound();
    $this->actingAs($staff)->get("/panel/{$restaurant->slug}/statistics")->assertForbidden();
});

test('cuenta solo los clics de su restaurante', function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-29 12:00', 'America/Bogota'));
    $restaurant = Restaurant::factory()->claimed()->create();
    $other = Restaurant::factory()->claimed()->create();
    intentAt($restaurant, '2026-10-29 09:00');
    intentAt($other, '2026-10-29 09:00');
    intentAt($other, '2026-10-28 09:00');

    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(Statistics::class)
        ->assertSeeHtml('data-stat="current">1<')
        ->assertSeeHtml('data-stat="previous">0<');
});

test('7 y 30 días, por día en hora de Colombia, contra el período anterior y por entrega', function () {
    $now = CarbonImmutable::parse('2026-10-29 12:00', 'America/Bogota');
    $restaurant = Restaurant::factory()->claimed()->create();
    intentAt($restaurant, '2026-10-29 08:00');
    intentAt($restaurant, '2026-10-29 23:30', Fulfillment::Pickup); // 04:30 del 30 en UTC: es del 29.
    intentAt($restaurant, '2026-10-23 00:10'); // primer día de los últimos 7
    intentAt($restaurant, '2026-10-22 23:50'); // último día del período anterior
    intentAt($restaurant, '2026-10-16 00:00'); // primer día del período anterior
    intentAt($restaurant, '2026-10-15 23:59'); // fuera de los dos
    intentAt($restaurant, '2026-10-30 00:00'); // mañana: no cuenta

    $week = OrderIntentStats::for($restaurant, 7, $now);
    expect($week->current)->toBe(3)
        ->and($week->previous)->toBe(2)
        ->and($week->change())->toBe(50)
        ->and($week->delivery)->toBe(2)
        ->and($week->pickup)->toBe(1)
        ->and($week->perDay)->toHaveCount(7)
        ->and(array_key_first($week->perDay))->toBe('2026-10-23')
        ->and(array_key_last($week->perDay))->toBe('2026-10-29')
        ->and($week->perDay['2026-10-29'])->toBe(2)
        ->and($week->perDay['2026-10-25'])->toBe(0)
        ->and($week->peak())->toBe(2);

    $month = OrderIntentStats::for($restaurant, 30, $now);
    expect($month->current)->toBe(6)
        ->and($month->previous)->toBe(0)
        ->and($month->change())->toBeNull()
        ->and($month->perDay)->toHaveCount(30);
});

test('el período se cambia en la página y uno que no se ofrece vuelve a 7 días', function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-29 12:00', 'America/Bogota'));
    $restaurant = Restaurant::factory()->claimed()->create();
    intentAt($restaurant, '2026-10-29 09:00');
    intentAt($restaurant, '2026-10-10 09:00');
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(Statistics::class)
        ->assertSeeHtml('data-stat="current">1<')
        ->call('setPeriod', 30)
        ->assertSeeHtml('data-stat="current">2<')
        ->assertSeeHtml('data-day="2026-09-30"')
        ->call('setPeriod', 365)
        ->assertSet('days', 365)
        ->assertSeeHtml('data-stat="current">1<')
        ->assertDontSeeHtml('data-day="2026-10-10"');
});

test('una sola consulta, que usa el índice (restaurant_id, created_at)', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    OrderIntent::factory()->for($restaurant)->count(3)->create();

    DB::enableQueryLog();
    OrderIntentStats::for($restaurant, 30);
    $queries = DB::getQueryLog();

    expect($queries)->toHaveCount(1);

    DB::statement('SET LOCAL enable_seqscan = off');
    $plan = collect(DB::select('EXPLAIN '.$queries[0]['query'], $queries[0]['bindings']))->pluck('QUERY PLAN')->implode("\n");
    expect($plan)->toContain('order_intents_restaurant_id_created_at_index');
});

test('la tabla lleva su título para lectores de pantalla y el cambio se anuncia (EVA-014)', function () {
    $restaurant = Restaurant::factory()->claimed()->create();
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::test(Statistics::class)
        ->assertSeeHtml('<caption')
        ->assertSeeHtml(__('panel.stats.per_day').'</caption>')
        ->assertSeeHtml('aria-live="polite"');
});

test('un período que no es número en la URL no rompe la página: queda en 7 días', function () {
    // Con Livewire::withQueryParams y no con una petición HTTP: la petición
    // con ?days=abc deja estado de Livewire en el proceso y ensucia el HTML de
    // las pruebas que siguen (la de /offline).
    $restaurant = Restaurant::factory()->claimed()->create();
    actInPanel(panelMember($restaurant), $restaurant);

    Livewire::withQueryParams(['days' => 'abc'])
        ->test(Statistics::class)
        ->assertOk()
        ->assertSee(__('panel.stats.current', ['days' => 7]));
});
