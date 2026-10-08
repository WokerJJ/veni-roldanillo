<?php

namespace App\Support;

use Carbon\CarbonImmutable;

/**
 * El día en Roldanillo: el de la zona horaria de la aplicación
 * (America/Bogota), aunque el reloj del servidor estuviera en otra.
 */
final class BusinessDay
{
    /**
     * Hasta cuántos días adelante viajan los horarios especiales al
     * dispositivo: hasta donde busca la próxima apertura (DAYS_AHEAD en
     * resources/js/restaurants/openStatus.ts).
     */
    public const SPECIAL_HOURS_DAYS_AHEAD = 7;

    public static function today(): CarbonImmutable
    {
        return CarbonImmutable::now(config()->string('app.timezone'))->startOfDay();
    }

    /**
     * Entre qué fechas viajan los horarios especiales al dispositivo, que con
     * ellos calcula «abierto ahora» y cuándo vuelve a abrir (ADR 0017): desde
     * ayer, porque una franja de la víspera puede pasar la medianoche y seguir
     * abierta hoy, hasta una semana adelante.
     *
     * El mapa y la ficha mandan la misma ventana: con el mismo horario, el
     * estado que se lee en los dos es el mismo.
     *
     * @return array{string, string} Desde y hasta (`Y-m-d`), las dos incluidas.
     */
    public static function specialHoursWindow(): array
    {
        $today = self::today();

        return [$today->subDay()->toDateString(), $today->addDays(self::SPECIAL_HOURS_DAYS_AHEAD)->toDateString()];
    }
}
