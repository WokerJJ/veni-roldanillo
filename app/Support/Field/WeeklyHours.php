<?php

namespace App\Support\Field;

/**
 * Las reglas del horario semanal de una captura: apertura distinta del cierre,
 * una franja que cierra antes de abrir termina al día siguiente y las franjas
 * no se solapan. Los rangos son [apertura, cierre): 11-15 y 15-18 no chocan.
 *
 * La base (opening_hours) solo compara franjas del mismo día. Aquí se pide un
 * poco más: la semana es circular, y la noche que pasa la medianoche no puede
 * pisar la madrugada del día siguiente (sábado 22:00-02:00 con domingo
 * 01:00-03:00 es inválido; domingo después del sábado también). La misma regla
 * vive en resources/campo/draft.ts.
 */
final class WeeklyHours
{
    public const int MAX_SLOTS = 28;

    private const int DAY = 1440;

    private const int WEEK = 7 * self::DAY;

    /**
     * @param  list<array{weekday: int, opens: string, closes: string}>  $slots
     */
    public static function isValid(array $slots): bool
    {
        $ranges = [];

        foreach ($slots as $slot) {
            $opens = self::minutes($slot['opens']);
            $closes = self::minutes($slot['closes']);

            if ($opens === null || $closes === null || $opens === $closes) {
                return false;
            }

            // Minutos desde el domingo 00:00 (weekday 0), en una semana que da la vuelta.
            $start = $slot['weekday'] * self::DAY + $opens;
            $ranges[] = [$start, $start + ($closes < $opens ? $closes + self::DAY : $closes) - $opens];
        }

        usort($ranges, fn (array $a, array $b): int => $a[0] <=> $b[0]);

        for ($i = 1; $i < count($ranges); $i++) {
            if ($ranges[$i][0] < $ranges[$i - 1][1]) {
                return false;
            }
        }

        // El cierre de la última franja de la semana no pasa de la apertura de la primera.
        return $ranges === [] || $ranges[count($ranges) - 1][1] <= $ranges[0][0] + self::WEEK;
    }

    private static function minutes(string $time): ?int
    {
        if (preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', $time, $m) !== 1) {
            return null;
        }

        return ((int) $m[1]) * 60 + (int) $m[2];
    }
}
