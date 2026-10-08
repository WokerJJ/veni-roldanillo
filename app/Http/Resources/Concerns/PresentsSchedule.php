<?php

namespace App\Http\Resources\Concerns;

use App\Models\OpeningHour;
use App\Models\Restaurant;
use LogicException;

/**
 * El horario como lo lee el dispositivo para calcular «abierto ahora»
 * (resources/js/restaurants/openStatus.ts, ADR 0017). El mapa y la ficha lo
 * mandan con la misma forma: una sola manera de escribirlo.
 *
 * @phpstan-type WeeklyHours array{weekday: int, opens: string, closes: string}
 */
trait PresentsSchedule
{
    /**
     * El horario semanal, con openingHours ya cargada (y en orden).
     *
     * @return list<WeeklyHours>
     */
    protected static function weeklyHours(Restaurant $restaurant): array
    {
        return array_values($restaurant->openingHours
            ->map(fn (OpeningHour $slot): array => [
                'weekday' => $slot->weekday,
                'opens' => self::time($slot->opens_at),
                'closes' => self::time($slot->closes_at),
            ])
            ->all());
    }

    /** «11:00:00» de PostgreSQL → «11:00»: los horarios van al minuto. */
    protected static function time(string $value): string
    {
        if (preg_match('/^\d{2}:\d{2}/', $value, $match) !== 1) {
            throw new LogicException("«{$value}» no es una hora.");
        }

        return $match[0];
    }
}
