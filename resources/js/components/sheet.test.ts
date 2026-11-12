import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { beginDrag, CONTROLS_REM, releaseSpeed, settle, SNAP_HEIGHTS, stepSnap, trackDrag } from './sheet';

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

    it('CSS las entiende: asomado en rem, media altura del mapa, y completo sin tapar la barra de pestañas', () => {
        expect(SNAP_HEIGHTS.peek).toBe('8.5rem');
        expect(SNAP_HEIGHTS.half).toBe('50%');
        expect(SNAP_HEIGHTS.full).toContain('var(--veni-tabbar-space)');
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

describe('el arrastre común del panel y de la hoja del plato (ADR 0042)', () => {
    /** Un evento de puntero con su hora y un destino que acepta la captura. */
    function pointer(type: string, clientY: number, time: number, init: PointerEventInit = {}): { event: PointerEvent; captured: number[] } {
        const captured: number[] = [];
        const event = new PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, clientY, ...init });
        Object.defineProperty(event, 'timeStamp', { value: time });
        Object.defineProperty(event, 'currentTarget', { value: { setPointerCapture: (id: number) => captured.push(id) } });

        return { event, captured };
    }

    it('empieza con el puntero primario y lo captura; con otro botón o un segundo dedo, no', () => {
        const primary = pointer('pointerdown', 100, 0);

        expect(beginDrag(primary.event)).toEqual({ pointer: 1, startY: 100, lastY: 100, lastTime: 0, velocity: 0, moved: false });
        expect(primary.captured).toEqual([1]);

        const right = pointer('pointerdown', 100, 0, { button: 2 });
        const second = pointer('pointerdown', 100, 0, { isPrimary: false });

        expect(beginDrag(right.event)).toBeNull();
        expect(beginDrag(second.event)).toBeNull();
        expect([...right.captured, ...second.captured]).toEqual([]);
    });

    it('dice cuánto bajó (negativo si subió) y guarda la velocidad del último tramo, positiva hacia abajo', () => {
        const drag = beginDrag(pointer('pointerdown', 100, 0).event);

        expect(trackDrag(drag, pointer('pointermove', 160, 20).event)).toBe(60);
        expect(drag?.velocity).toBe(3);
        expect(trackDrag(drag, pointer('pointermove', 80, 40).event)).toBe(-20);
        expect(drag?.velocity).toBe(-4);
    });

    it('sin arrastre, o con otro puntero, no sigue nada', () => {
        const drag = beginDrag(pointer('pointerdown', 100, 0).event);

        expect(trackDrag(null, pointer('pointermove', 160, 20).event)).toBeNull();
        expect(trackDrag(drag, pointer('pointermove', 160, 20, { pointerId: 2 }).event)).toBeNull();
        expect(drag?.moved).toBe(false);
    });

    it('con margen, un toque que tiembla no es un arrastre; pasado el margen, ya sigue aunque vuelva', () => {
        const drag = beginDrag(pointer('pointerdown', 100, 0).event);

        expect(trackDrag(drag, pointer('pointermove', 103, 10).event, 6)).toBeNull();
        expect(drag?.moved).toBe(false);
        expect(trackDrag(drag, pointer('pointermove', 110, 20).event, 6)).toBe(10);
        expect(trackDrag(drag, pointer('pointermove', 102, 30).event, 6)).toBe(2);
    });

    it('al soltar, la velocidad es la del último tramo, o cero si estuvo quieto más de 100 ms', () => {
        const drag = beginDrag(pointer('pointerdown', 100, 0).event);

        if (drag === null) {
            throw new Error('sin arrastre');
        }

        trackDrag(drag, pointer('pointermove', 160, 20).event);

        expect(releaseSpeed(drag, pointer('pointerup', 160, 25).event)).toBe(3);
        expect(releaseSpeed(drag, pointer('pointerup', 160, 500).event)).toBe(0);
    });
});
