<?php

use App\Models\FieldSubmission;
use App\Support\GeoPoint;

/**
 * La huella del contenido (ADR 0048): lo que confirma el dueño. Una captura de
 * la etapa 1 no trae `menu`; una de la etapa 2 sin carta trae `menu: []`. Son el
 * mismo contenido y tienen que dar la misma huella.
 *
 * @return array<string, mixed>
 */
function hashPayload(): array
{
    return [
        'name' => 'Sazón del Parque',
        'category_ids' => [1],
        'address' => 'Carrera 8 # 10-20',
        'reference' => null,
        'phone' => null,
        'whatsapp' => '573001112233',
        'delivery' => false,
        'payment_methods' => ['cash'],
        'hours' => [['weekday' => 1, 'opens' => '11:00', 'closes' => '15:00']],
    ];
}

/** @param  array<string, mixed>  $payload */
function hashOf(array $payload): string
{
    /** @phpstan-ignore argument.type */
    return FieldSubmission::hashContent($payload, new GeoPoint(4.4120, -76.1540), 'Marta Ríos', 'owner', '573004445566');
}

test('una captura sin menu y una con menu vacío tienen la misma huella', function () {
    expect(hashOf([...hashPayload(), 'menu' => []]))->toBe(hashOf(hashPayload()));
});

test('la huella de una captura de la etapa 1 (sin menu) no cambió: las confirmaciones ya dadas siguen valiendo', function () {
    expect(hashOf(hashPayload()))->toBe('c6959901f51816c5caad522fafe07e05c14f71e654e0d44dcf1d3033317107a2');
});

test('una carta con platos sí cambia la huella', function () {
    $menu = [['name_es' => 'Almuerzos', 'name_en' => null, 'dishes' => [['name_es' => 'Sancocho', 'name_en' => null, 'price' => 18000, 'is_alcohol' => false, 'catalog_variant_id' => null]]]];

    expect(hashOf([...hashPayload(), 'menu' => $menu]))->not->toBe(hashOf(hashPayload()));
});
