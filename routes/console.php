<?php

use App\Models\OrderIntent;
use App\Models\RestaurantClaim;
use App\Models\RestaurantRemovalRequest;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Retención (#20, ADR 0026, Ley 1581): a los seis meses de resueltos, los
// reclamos y pedidos de retiro rechazados se borran y los aprobados se
// anonimizan (PrunedAfterReview). Los registros de «Enviar pedido por
// WhatsApp» (#22, ADR 0031) se borran a los 13 meses. Lo corre el contenedor
// scheduler.
Schedule::command('model:prune', [
    '--model' => [RestaurantClaim::class, RestaurantRemovalRequest::class, OrderIntent::class],
])->daily()->onOneServer();

// Las sesiones inactivas y la caché vencida (#23): la política de datos dice
// que la sesión, con la IP, se borra tras unas dos horas sin uso, y Laravel
// solo lo hace por sorteo. Cada hora, así ninguna pasa de tres.
Schedule::command('veni:prune-expired')->hourly()->onOneServer();

// El índice de la búsqueda por plato (#17, ADR 0029) igual a la base: lo
// mantiene el worker, y esto repara lo que se perdió (un trabajo que agotó
// sus intentos, un worker parado). A la madrugada, cuando casi nadie busca.
Schedule::command('veni:search-sync')->dailyAt('04:00')->withoutOverlapping()->onOneServer();
