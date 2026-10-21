import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CONTROLS_REM, settle, SNAP_HEIGHTS, stepSnap } from './sheet';

// Un celular de 390 × 844: el mapa mide unos 760 px de alto bajo la cabecera.
const HEIGHTS = { peek: 120, half: 380, full: 716 };

describe('cuándo el panel va abajo y cuándo al costado', () => {
    it('abajo por debajo de 480 px, y hasta 767 px si hay alto; al costado desde 768 px o, desde 480, con poco alto (acostado)', () => {
        const css = readFileSync('resources/css/app.css', 'utf8');

        expect(css).toMatch(/@custom-variant sheet \{\s*@media \(width < 30rem\), \(width < 48rem\) and \(height >= 32rem\) \{/);
        expect(css).toMatch(/@custom-variant side \{\s*@media \(width >= 48rem\), \(width >= 30rem\) and \(height < 32rem\) \{/);
    });
});

describe('las alturas del panel de abajo', () => {
    it('suben y bajan de a una, sin pasarse de los extremos', () => {
        expect(stepSnap('peek', 1)).toBe('half');
        expect(stepSnap('half', 1)).toBe('full');
        expect(stepSnap('full', 1)).toBe('full');
        expect(stepSnap('full', -1)).toBe('half');
        expect(stepSnap('peek', -1)).toBe('peek');
    });

    it('CSS las entiende: asomado en rem, media altura del mapa, y completo sin tapar la atribución', () => {
        expect(SNAP_HEIGHTS.peek).toBe('7.5rem');
        expect(SNAP_HEIGHTS.half).toBe('50%');
        expect(SNAP_HEIGHTS.full).toContain('var(--veni-attribution-clearance)');
        expect(SNAP_HEIGHTS.full).toContain('var(--veni-update-prompt-space, 0px)');
    });

    it('completo deja libre arriba la franja de los botones del mapa (zoom y «¿Dónde estoy?»)', () => {
        expect(CONTROLS_REM).toBe(10);
        expect(SNAP_HEIGHTS.full).toContain(`- ${String(CONTROLS_REM)}rem`);
    });

    it.each([
        [140, 'peek'],
        [260, 'half'],
        [520, 'half'],
        [600, 'full'],
    ] as const)('soltado despacio a %i px, queda en la más cercana (%s)', (height, snap) => {
        expect(settle(height, 0.1, HEIGHTS)).toBe(snap);
    });

    it('un gesto rápido sigue en su dirección aunque no haya llegado a la mitad', () => {
        expect(settle(150, 1, HEIGHTS)).toBe('half');
        expect(settle(400, 1, HEIGHTS)).toBe('full');
        expect(settle(690, -1, HEIGHTS)).toBe('half');
        expect(settle(360, -1, HEIGHTS)).toBe('peek');
    });

    it('rápido contra un extremo, se queda en él', () => {
        expect(settle(716, 2, HEIGHTS)).toBe('full');
        expect(settle(120, -2, HEIGHTS)).toBe('peek');
    });
});
