import { describe, expect, it } from 'vitest';

import { paddingAround } from './padding';

/** El mapa del inicio en un celular (390 de ancho, bajo la cabecera) y en una computadora. */
const PHONE = { top: 64, right: 390, bottom: 844, left: 0 };
const DESKTOP = { top: 64, right: 1280, bottom: 800, left: 0 };

describe('paddingAround', () => {
    it('un panel abajo, a lo ancho (el celular): deja libre lo de arriba', () => {
        const sheet = { top: 520, right: 378, bottom: 808, left: 12 };

        expect(paddingAround(PHONE, sheet)).toEqual({ top: 0, right: 0, bottom: 324, left: 0 });
    });

    it('un panel alto a la izquierda (la computadora con la lista): deja libre lo de la derecha', () => {
        const list = { top: 80, right: 400, bottom: 764, left: 16 };

        expect(paddingAround(DESKTOP, list)).toEqual({ top: 0, right: 0, bottom: 0, left: 400 });
    });

    it('un panel bajo arriba a la izquierda: lo saca por arriba si así queda más mapa a la vista', () => {
        const welcome = { top: 80, right: 400, bottom: 240, left: 16 };

        expect(paddingAround(DESKTOP, welcome)).toEqual({ top: 176, right: 0, bottom: 0, left: 0 });
    });

    it('un panel que no toca el mapa no deja margen', () => {
        expect(paddingAround(DESKTOP, { top: 0, right: 400, bottom: 60, left: 0 })).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    it('si el panel tapa casi todo, deja libres al menos 88 px: MapLibre necesita dónde encuadrar sin alejar de más', () => {
        const landscape = { top: 0, right: 844, bottom: 390, left: 0 };
        const list = { top: 16, right: 828, bottom: 374, left: 16 };

        expect(paddingAround(landscape, list)).toEqual({ top: 302, right: 0, bottom: 0, left: 0 });
    });

    it('con un mapa sin tamaño (todavía sin pintar), ninguno', () => {
        expect(paddingAround({ top: 0, right: 0, bottom: 0, left: 0 }, { top: 0, right: 10, bottom: 10, left: 0 })).toEqual({
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
        });
    });

    it('redondea hacia arriba: nunca queda medio píxel del panel encima', () => {
        expect(paddingAround(PHONE, { top: 600.4, right: 378, bottom: 808, left: 12 }).bottom).toBe(244);
    });
});
