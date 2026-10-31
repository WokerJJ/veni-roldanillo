<?php

use App\Models\OrderIntent;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;

/*
| Retención de los registros de «Enviar pedido por WhatsApp» (#22, ADR 0031):
| se borran a los 13 meses con model:prune, que corre el scheduler a diario.
*/

uses(RefreshDatabase::class);

test('model:prune borra los registros de más de 13 meses y deja los demás', function () {
    $old = OrderIntent::factory()->create(['created_at' => now()->subMonthsNoOverflow(OrderIntent::RETENTION_MONTHS)->subDay()]);
    $kept = OrderIntent::factory()->create(['created_at' => now()->subMonthsNoOverflow(OrderIntent::RETENTION_MONTHS)->addDay()]);
    $recent = OrderIntent::factory()->create();

    $this->artisan('model:prune', ['--model' => [OrderIntent::class]])->assertSuccessful();

    expect(OrderIntent::query()->pluck('id')->all())->toEqualCanonicalizing([$kept->id, $recent->id])
        ->and(OrderIntent::query()->find($old->id))->toBeNull();
});

test('a fin de mes los 13 meses no se desbordan al mes siguiente (BUG-015)', function () {
    // 2027-03-31 menos 13 meses es 2026-02-28, no «2026-02-31» = 2026-03-03.
    $this->travelTo('2027-03-31 12:00');
    $kept = OrderIntent::factory()->create(['created_at' => '2026-03-01 12:00']);
    $old = OrderIntent::factory()->create(['created_at' => '2026-02-27 12:00']);

    $this->artisan('model:prune', ['--model' => [OrderIntent::class]])->assertSuccessful();

    expect(OrderIntent::query()->find($kept->id))->not->toBeNull()
        ->and(OrderIntent::query()->find($old->id))->toBeNull();
});

test('el scheduler corre model:prune con OrderIntent todos los días', function () {
    $events = collect(app(Schedule::class)->events())
        ->filter(fn (Event $event): bool => str_contains((string) $event->command, 'model:prune') && str_contains((string) $event->command, 'OrderIntent'));

    expect($events)->toHaveCount(1)
        ->and($events->first()?->expression)->toBe('0 0 * * *');
});
