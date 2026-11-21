import { describe, expect, it } from 'vitest';

import type { Draft, MenuDish, MenuSection } from './draft';
import { dishCount, draftFromReturned, firstInvalidStep, isDishIncomplete, menuProblem, newDraft, toBody, unpricedCount, validateStep } from './draft';

/*
| La carta en el borrador (ADR 0052): las mismas reglas del servidor (FieldMenu)
| para avisar en el local, sin señal.
*/

function complete(overrides: Partial<Draft> = {}): Draft {
    return {
        ...newDraft('11111111-1111-4111-8111-111111111111', new Date('2026-11-20T15:00:00Z')),
        name: 'Sazón del Parque',
        categoryIds: [1],
        address: 'Carrera 8 # 10-20',
        latitude: 4.412,
        longitude: -76.154,
        locationSource: 'device',
        delivery: true,
        ownerName: 'Marta Ríos',
        ownerPhone: '3004445566',
        purposeExplained: true,
        duplicates: [],
        ...overrides,
    };
}

const dish = (name: string, price: number | null, extra: Partial<MenuDish> = {}): MenuDish => ({ name_es: name, name_en: null, price, is_alcohol: false, catalog_variant_id: null, ...extra });
const section = (name: string, dishes: MenuDish[]): MenuSection => ({ name_es: name, name_en: null, dishes });

describe('la carta del borrador', () => {
    it('una carta vacía vale: se puede cargar después', () => {
        expect(menuProblem([])).toBeNull();
        expect(validateStep(complete(), 'menu')).toEqual({});
    });

    it('pide nombre y precio en cada plato', () => {
        expect(menuProblem([section('Almuerzos', [dish('Sancocho', null)])])).toBe('menu_dish');
        expect(menuProblem([section('Almuerzos', [dish(' ', 1000)])])).toBe('menu_dish');
        expect(menuProblem([section('Almuerzos', [dish('Sancocho', -1)])])).toBe('menu_dish');
        expect(menuProblem([section('Almuerzos', [dish('Sancocho', 10.5)])])).toBe('menu_dish');
        expect(menuProblem([section('Almuerzos', [dish('Sancocho', 10_000_000)])])).toBe('menu_dish');
        expect(menuProblem([section('Almuerzos', [dish('Sancocho', 0)])])).toBeNull();
    });

    it('no deja secciones ni platos repetidos, sin importar mayúsculas ni espacios', () => {
        expect(menuProblem([section('Bebidas', [dish('A', 1)]), section(' bebidas ', [dish('B', 1)])])).toBe('menu_duplicate_section');
        expect(menuProblem([section('Bebidas', [dish('Sopa', 1), dish('SOPA  ', 2)])])).toBe('menu_duplicate_dish');
        expect(menuProblem([section('Bebidas', [dish('Sopa', 1)]), section('Comidas', [dish('Sopa', 1)])])).toBeNull();
    });

    it('una sección sin nombre pero con platos es un error; sin platos, se ignora', () => {
        expect(menuProblem([section('', [dish('A', 1)])])).toBe('menu_section');
        expect(menuProblem([section('', [])])).toBeNull();
    });

    it('respeta los límites del servidor: 12 secciones, 60 platos por sección y 300 en total', () => {
        const many = (count: number, size: number): MenuSection[] =>
            Array.from({ length: count }, (_, n) => section(`S${String(n)}`, Array.from({ length: size }, (_, d) => dish(`P${String(n)}-${String(d)}`, 1))));

        expect(menuProblem(many(13, 1))).toBe('menu_too_many');
        expect(menuProblem(many(1, 61))).toBe('menu_too_many');
        expect(menuProblem(many(12, 26))).toBe('menu_too_many');
        expect(menuProblem(many(12, 25))).toBeNull();
        expect(dishCount(many(3, 4))).toBe(12);
    });

    it('se valida en los pasos de la carta y del catálogo, y bloquea el borrador', () => {
        const draft = complete({ menu: [section('Bebidas', [dish('Gaseosa', null, { catalog_variant_id: 5 })])] });

        expect(validateStep(draft, 'menu')).toEqual({ menu: 'menu_dish' });
        expect(validateStep(draft, 'catalog')).toEqual({ menu: 'menu_dish' });
        expect(firstInvalidStep(draft)).toBe('menu');
    });

    it('el cuerpo no manda secciones vacías y recorta los nombres', () => {
        const body = toBody(complete({ menu: [section(' Almuerzos ', [dish(' Sancocho ', 18000, { name_en: ' ' })]), section('Vacía', [])] }));

        expect(body.menu).toEqual([{ name_es: 'Almuerzos', name_en: null, dishes: [{ name_es: 'Sancocho', name_en: null, price: 18000, is_alcohol: false, catalog_variant_id: null }] }]);
    });

    it('una captura devuelta de la etapa 1 (sin carta) se corrige con la carta vacía', () => {
        const { captured_at: capturedAt, menu, ...content } = toBody(complete());

        expect(capturedAt).toBeDefined();
        expect(menu).toEqual([]);
        expect(draftFromReturned('33333333-3333-4333-8333-333333333333', content, null).menu).toEqual([]);
    });

    it('una captura devuelta con carta la trae para corregirla', () => {
        const { captured_at: capturedAt, ...content } = toBody(complete({ menu: [section('Almuerzos', [dish('Sancocho', 18000)])] }));

        expect(capturedAt).toBeDefined();
        expect(draftFromReturned('44444444-4444-4444-8444-444444444444', content, 'Falta un precio').menu).toEqual([section('Almuerzos', [dish('Sancocho', 18000)])]);
    });
});

describe('platos incompletos', () => {
    const dish = (name_es: string, price: number | null): MenuDish => ({ name_es, name_en: null, price, is_alcohol: false, catalog_variant_id: null });

    it('falta el nombre o el precio; un precio de 0 cuenta como puesto', () => {
        expect(isDishIncomplete(dish('Sopa', 9000))).toBe(false);
        expect(isDishIncomplete(dish('Sopa', 0))).toBe(false);
        expect(isDishIncomplete(dish('Sopa', null))).toBe(true);
        expect(isDishIncomplete(dish('   ', 9000))).toBe(true);
    });

    it('cuenta los platos sin precio de toda la carta', () => {
        const menu: MenuSection[] = [
            { name_es: 'A', name_en: null, dishes: [dish('Sopa', null), dish('Arroz', 5000)] },
            { name_es: 'B', name_en: null, dishes: [dish('Jugo', null)] },
        ];

        expect(unpricedCount(menu)).toBe(2);
    });
});
