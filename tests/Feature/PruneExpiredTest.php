<?php

use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/*
| Retención de lo técnico (#23): la política de datos dice que la sesión
| (con la IP y el navegador) se borra tras unas dos horas de inactividad y
| que los límites de intentos guardan la IP «por un rato». Con las sesiones y
| la caché en PostgreSQL, Laravel solo borra las filas vencidas por sorteo, a
| veces; veni:prune-expired lo hace siempre, cada hora.
*/

uses(RefreshDatabase::class);

test('veni:prune-expired borra las sesiones inactivas y la caché vencida, y deja lo vigente', function () {
    config(['session.lifetime' => 120]);
    $now = now()->getTimestamp();

    DB::table('sessions')->insert([
        ['id' => 'vencida', 'user_id' => null, 'ip_address' => '203.0.113.1', 'user_agent' => 'prueba', 'payload' => '', 'last_activity' => $now - 121 * 60],
        ['id' => 'vigente', 'user_id' => null, 'ip_address' => '203.0.113.2', 'user_agent' => 'prueba', 'payload' => '', 'last_activity' => $now - 119 * 60],
    ]);
    DB::table('cache')->insert([
        ['key' => 'limite-vencido', 'value' => '1', 'expiration' => $now - 1],
        ['key' => 'limite-vigente', 'value' => '1', 'expiration' => $now + 60],
    ]);
    DB::table('cache_locks')->insert([
        ['key' => 'candado-vencido', 'owner' => 'x', 'expiration' => $now - 1],
        ['key' => 'candado-vigente', 'owner' => 'x', 'expiration' => $now + 60],
    ]);

    $this->artisan('veni:prune-expired')->assertSuccessful();

    expect(DB::table('sessions')->pluck('id')->all())->toBe(['vigente'])
        ->and(DB::table('cache')->pluck('key')->all())->toBe(['limite-vigente'])
        ->and(DB::table('cache_locks')->pluck('key')->all())->toBe(['candado-vigente']);
});

test('veni:prune-expired corre cada hora en un solo servidor', function () {
    $event = collect(app(Schedule::class)->events())
        ->first(fn (Event $event): bool => str_contains((string) $event->command, 'veni:prune-expired'));

    expect($event)->toBeInstanceOf(Event::class)
        ->and($event?->expression)->toBe('0 * * * *')
        ->and($event?->onOneServer)->toBeTrue();
});

test('borra los originales de fotos que llevan más de un día sin procesar (#113)', function () {
    Storage::fake('local');
    $disk = Storage::disk('local');
    $disk->put('media-pending/viejo.png', 'x');
    touch($disk->path('media-pending/viejo.png'), now()->subDays(2)->getTimestamp());
    $disk->put('media-pending/reciente.png', 'x');

    $this->artisan('veni:prune-expired')->assertSuccessful();

    expect($disk->allFiles('media-pending'))->toBe(['media-pending/reciente.png']);
});
