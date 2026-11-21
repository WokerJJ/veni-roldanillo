<?php

namespace App\Support\Field;

/**
 * Las reglas de la carta que se levanta en una captura de campo (ADR 0052): sus
 * límites y lo que el servidor revisa además de cada campo. La carta viaja en
 * el payload de la captura; solo al aprobar se vuelve secciones y platos.
 */
final class FieldMenu
{
    public const int MAX_SECTIONS = 12;

    public const int MAX_DISHES_PER_SECTION = 60;

    public const int MAX_DISHES = 300;

    /** En pesos enteros: nueve millones novecientos noventa y nueve mil. */
    public const int MAX_PRICE = 9_999_999;

    /**
     * Lo que impide guardar la carta aunque cada campo sea válido: demasiados
     * platos en total, o secciones o platos que se repiten dentro de su lugar.
     * Devuelve la clave de `field.validation.menu_*` o null si está bien.
     *
     * @param  list<array{name_es: string, name_en: string|null, dishes: list<array{name_es: string, name_en: string|null, price: int, is_alcohol: bool, catalog_variant_id: int|null}>}>  $menu
     */
    public static function problem(array $menu): ?string
    {
        $total = 0;
        $sections = [];

        foreach ($menu as $section) {
            $key = self::normalized($section['name_es']);

            if (isset($sections[$key])) {
                return 'duplicate_section';
            }

            $sections[$key] = true;
            $dishes = [];

            foreach ($section['dishes'] as $dish) {
                $total++;
                $dishKey = self::normalized($dish['name_es']);

                if (isset($dishes[$dishKey])) {
                    return 'duplicate_dish';
                }

                $dishes[$dishKey] = true;
            }
        }

        return $total > self::MAX_DISHES ? 'too_many' : null;
    }

    /** Sin mayúsculas ni espacios de más: «Coca-Cola 400 ml» y «coca-cola  400 ml» son el mismo plato. */
    private static function normalized(string $name): string
    {
        return mb_strtolower((string) preg_replace('/\s+/u', ' ', trim($name)));
    }

    /**
     * @param  list<array{dishes: list<mixed>}>  $menu
     */
    public static function dishCount(array $menu): int
    {
        return array_sum(array_map(fn (array $section): int => count($section['dishes']), $menu));
    }
}
