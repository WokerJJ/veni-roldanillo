<?php

namespace App\Listeners;

use Illuminate\Encryption\MissingAppKeyException;
use Illuminate\Foundation\Events\DiagnosingHealth;
use Illuminate\Support\Facades\DB;

/**
 * Hace que /up responda 500 si la aplicación no puede atender peticiones:
 * sin APP_KEY o sin conexión a la base de datos.
 */
class CheckApplicationHealth
{
    public function handle(DiagnosingHealth $event): void
    {
        if (blank(config('app.key'))) {
            throw new MissingAppKeyException;
        }

        DB::connection()->getPdo();
    }
}
