<?php

use App\Models\RestaurantClaim;
use App\Models\RestaurantRemovalRequest;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Retención (#20, ADR 0026, Ley 1581): los reclamos y pedidos de retiro ya
// resueltos se borran a los seis meses (PrunedAfterReview). Lo corre el
// contenedor scheduler.
Schedule::command('model:prune', [
    '--model' => [RestaurantClaim::class, RestaurantRemovalRequest::class],
])->daily()->onOneServer();
