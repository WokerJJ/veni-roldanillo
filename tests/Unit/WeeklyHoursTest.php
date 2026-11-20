<?php

use App\Support\Field\WeeklyHours;

/**
 * El horario semanal del modo Campo (ADR 0048): la semana es circular, así que una
 * franja que pasa la medianoche no puede pisar el comienzo del día siguiente, y la
 * del sábado tampoco la del domingo. La misma regla vive en resources/campo/draft.ts.
 */

/**
 * @return array{weekday: int, opens: string, closes: string}
 */
function slot(int $weekday, string $opens, string $closes): array
{
    return ['weekday' => $weekday, 'opens' => $opens, 'closes' => $closes];
}

test('acepta franjas que se tocan, la que pasa la medianoche y un horario vacío', function (array $slots) {
    expect(WeeklyHours::isValid($slots))->toBeTrue();
})->with([
    'vacío' => [[]],
    'se tocan' => [[slot(1, '11:00', '15:00'), slot(1, '15:00', '18:00'), slot(1, '19:00', '02:00')]],
    'la noche del lunes termina antes de abrir el martes' => [[slot(1, '22:00', '02:00'), slot(2, '02:00', '04:00')]],
    'del sábado al domingo, sin pisarse' => [[slot(6, '22:00', '02:00'), slot(0, '02:00', '04:00')]],
    'la del domingo no pisa el sábado siguiente' => [[slot(0, '10:00', '14:00'), slot(6, '10:00', '23:00')]],
]);

test('rechaza franjas que se cruzan, abrir y cerrar a la misma hora y horas mal escritas', function (array $slots) {
    expect(WeeklyHours::isValid($slots))->toBeFalse();
})->with([
    'se cruzan el mismo día' => [[slot(2, '10:00', '14:00'), slot(2, '13:00', '16:00')]],
    'abre y cierra a la misma hora' => [[slot(2, '10:00', '10:00')]],
    'hora mal escrita' => [[slot(2, '25:00', '10:00')]],
    'dos noches del mismo día' => [[slot(2, '18:00', '02:00'), slot(2, '23:00', '03:00')]],
    'la noche del lunes pisa la madrugada del martes' => [[slot(1, '22:00', '02:00'), slot(2, '01:00', '03:00')]],
    'la noche del sábado pisa la madrugada del domingo' => [[slot(6, '22:00', '02:00'), slot(0, '01:00', '03:00')]],
    'el orden de las franjas no cambia el resultado' => [[slot(0, '01:00', '03:00'), slot(6, '22:00', '02:00')]],
]);
