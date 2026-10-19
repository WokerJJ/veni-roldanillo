<?php

use App\Models\Restaurant;
use App\Models\SpecialHour;
use App\Support\BusinessDay;
use Illuminate\Foundation\Testing\RefreshDatabase;

/*
| El día en Roldanillo es el de Colombia, corra la app con la zona horaria que
| corra. Con APP_TIMEZONE=UTC, si «hoy» saliera de la zona de la app, el día
| cambiaría a las 19:00 de Colombia, y con él la ventana de horarios
| especiales que viaja al dispositivo.
*/

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->phpTimeZone = date_default_timezone_get();

    // Como arranca la app con APP_TIMEZONE=UTC.
    config(['app.timezone' => 'UTC']);
    date_default_timezone_set('UTC');
});

afterEach(function () {
    date_default_timezone_set($this->phpTimeZone);
});

test('hoy es el día de Colombia aunque la app corra en UTC', function () {
    // 20:00 del 7 de octubre en Colombia: en UTC ya es 8.
    $this->travelTo('2026-10-08 01:00:00 UTC');

    expect(BusinessDay::today()->toDateString())->toBe('2026-10-07')
        ->and(BusinessDay::specialHoursWindow())->toBe(['2026-10-06', '2026-10-14']);

    // Medianoche en Colombia: ahí cambia el día, no a las 19:00.
    $this->travelTo('2026-10-08 05:00:00 UTC');

    expect(BusinessDay::today()->toDateString())->toBe('2026-10-08');
});

test('el mapa y la ficha siguen mandando el horario especial de ayer aunque la app corra en UTC', function () {
    // 20:00 del 7 de octubre en Colombia. Una franja del 6 que pasa la
    // medianoche puede seguir abierta: tiene que viajar.
    $this->travelTo('2026-10-08 01:00:00 UTC');
    $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);
    SpecialHour::factory()->for($restaurant)->open('20:00', '03:00')->create(['on_date' => '2026-10-06']);

    $onTheMap = $this->get('/api/restaurants.geojson')->assertOk()->json('features.0.properties.special_hours');
    $onTheProfile = $this->withoutVite()->get('/restaurants/la-ceiba')->assertOk()->inertiaProps('restaurant.special_hours');

    expect(array_column($onTheMap, 'date'))->toBe(['2026-10-06'])
        ->and(array_column($onTheProfile, 'date'))->toBe(['2026-10-06']);
});
