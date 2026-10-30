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
    $old = OrderIntent::factory()->create(['created_at' => now()->subMonths(OrderIntent::RETENTION_MONTHS)->subDay()]);
    $kept = OrderIntent::factory()->create(['created_at' => now()->subMonths(OrderIntent::RETENTION_MONTHS)->addDay()]);
    $recent = OrderIntent::factory()->create();

    $this->artisan('model:prune', ['--model' => [OrderIntent::class]])->assertSuccessful();

    expect(OrderIntent::query()->pluck('id')->all())->toEqualCanonicalizing([$kept->id, $recent->id])
        ->and(OrderIntent::query()->find($old->id))->toBeNull();
});

test('el scheduler corre model:prune con OrderIntent todos los días', function () {
    $events = collect(app(Schedule::class)->events())
        ->filter(fn (Event $event): bool => str_contains((string) $event->command, 'model:prune') && str_contains((string) $event->command, 'OrderIntent'));

    expect($events)->toHaveCount(1)
        ->and($events->first()?->expression)->toBe('0 0 * * *');
});
