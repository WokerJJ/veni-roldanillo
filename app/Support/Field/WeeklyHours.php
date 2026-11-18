<?php

namespace App\Support\Field;

/**
 * Las reglas del horario semanal de una captura, las mismas que la base
 * (opening_hours): apertura distinta del cierre, una franja que cierra antes
 * de abrir termina al día siguiente y las franjas de un mismo día no se
 * solapan. Los rangos son [apertura, cierre): 11-15 y 15-18 no chocan.
 */
final class WeeklyHours
{
    public const int MAX_SLOTS = 28;

    /**
     * @param  list<array{weekday: int, opens: string, closes: string}>  $slots
     */
    public static function isValid(array $slots): bool
    {
        $byDay = [];

        foreach ($slots as $slot) {
            $opens = self::minutes($slot['opens']);
            $closes = self::minutes($slot['closes']);

            if ($opens === null || $closes === null || $opens === $closes) {
                return false;
            }

            $byDay[$slot['weekday']][] = [$opens, $closes < $opens ? $closes + 1440 : $closes];
        }

        foreach ($byDay as $ranges) {
            usort($ranges, fn (array $a, array $b): int => $a[0] <=> $b[0]);

            for ($i = 1; $i < count($ranges); $i++) {
                if ($ranges[$i][0] < $ranges[$i - 1][1]) {
                    return false;
                }
            }
        }

        return true;
    }

    private static function minutes(string $time): ?int
    {
        if (preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', $time, $m) !== 1) {
            return null;
        }

        return ((int) $m[1]) * 60 + (int) $m[2];
    }
}
