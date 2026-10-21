import { describe, expect, it } from 'vitest';

import { settle, SNAP_HEIGHTS, stepSnap } from './sheet';

// Un celular de 390 × 844: el mapa mide unos 760 px de alto bajo la cabecera.
const HEIGHTS = { peek: 120, half: 380, full: 716 };

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
