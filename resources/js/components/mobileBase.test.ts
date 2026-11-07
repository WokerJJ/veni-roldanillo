import { readFileSync } from 'node:fs';

import { compileStyle, parse } from 'vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

/**
 * La base visual y el movimiento del celular (#138, ADR 0040), leídos del CSS
 * como lo compila Vue (como scopedStyles.test.ts): el movimiento va siempre
 * dentro de `prefers-reduced-motion: no-preference`, las hojas usan el radio
 * de la marca y el «−» desactivado llega a 3:1.
 */

/** El árbol de postcss que devuelve el compilador de Vue. */
type CssRoot = NonNullable<ReturnType<typeof compileStyle>['rawResult']>['root'];
/** Lo que se mira de cada nodo al subir por el árbol. */
interface CssNode {
    type: string;
    name?: string;
    params?: string;
    parent?: CssNode | undefined;
}

/** Los árboles de postcss de los `<style>` de un componente, o del CSS de la app. */
function roots(file: string): CssRoot[] {
    if (file.endsWith('.css')) {
        const { rawResult, errors } = compileStyle({ source: readFileSync(file, 'utf8'), filename: file, id: 'data-v-prueba' });
        expect(errors).toEqual([]);

        return rawResult ? [rawResult.root] : [];
    }

    const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file });

    return descriptor.styles.flatMap((style) => {
        const { rawResult, errors } = compileStyle({ source: style.content, filename: file, id: 'data-v-prueba', scoped: style.scoped === true });
        expect(errors).toEqual([]);

        return rawResult ? [rawResult.root] : [];
    });
}

/** Los `@media` que envuelven a un nodo. */
function mediaAround(node: { parent?: unknown }): string[] {
    const found: string[] = [];

    for (let parent = node.parent as CssNode | undefined; parent; parent = parent.parent) {
        if (parent.type === 'atrule' && parent.name === 'media') {
            found.push(parent.params ?? '');
        }
    }

    return found;
}

/** Las declaraciones que mueven algo y no están bajo `no-preference`. */
function motionOutsideNoPreference(file: string): string[] {
    const outside: string[] = [];

    for (const root of roots(file)) {
        root.walkDecls(/^(animation|animation-name|transition|transition-property|scale|translate)$/, (decl) => {
            // Lo de adentro de un @keyframes solo corre si una regla lo usa.
            const grandparent = (decl.parent as CssNode | undefined)?.parent;

            if (grandparent?.type === 'atrule' && grandparent.name?.endsWith('keyframes') === true) {
                return;
            }

            if (!mediaAround(decl).some((media) => media.includes('prefers-reduced-motion: no-preference'))) {
                outside.push(`${decl.prop}: ${decl.value}`);
            }
        });
    }

    return outside;
}

/** Una declaración y lo que la envuelve: su regla, sus `@media`, sus capas y sus variantes de Tailwind. */
interface Placed {
    prop: string;
    value: string;
    important: boolean;
    rule: string;
    media: string[];
    layers: string[];
    variants: string[];
}

/** Las declaraciones de `prop` en un archivo, con lo que las envuelve. */
function declsIn(file: string, prop: string | RegExp): Placed[] {
    const found: Placed[] = [];

    for (const root of roots(file)) {
        root.walkDecls(prop, (decl) => {
            const placed: Placed = { prop: decl.prop, value: decl.value.replace(/\s+/g, ' '), important: decl.important, rule: '', media: [], layers: [], variants: [] };

            for (let parent = decl.parent as (CssNode & { selector?: string }) | undefined; parent; parent = parent.parent as (CssNode & { selector?: string }) | undefined) {
                if (parent.type === 'rule' && placed.rule === '') {
                    placed.rule = (parent.selector ?? '').replace(/\s+/g, ' ');
                } else if (parent.type === 'atrule') {
                    const list = { media: placed.media, layer: placed.layers, variant: placed.variants }[parent.name ?? ''];
                    list?.push(parent.params ?? '');
                }
            }

            found.push(placed);
        });
    }

    return found;
}

const SHEETS = ['resources/js/components/DishPicker.vue', 'resources/js/components/OrderCart.vue', 'resources/js/components/SavedOnDevice.vue'];

describe('movimiento (#138, M11)', () => {
    it.each(['resources/css/app.css', ...SHEETS, 'resources/js/components/DishPhotoViewer.vue'])(
        '%s: todo lo que se mueve va dentro de prefers-reduced-motion: no-preference',
        (file) => {
            expect(motionOutsideNoPreference(file)).toEqual([]);
        },
    );

    it('la respuesta al tocar achica a 0,97 al presionar, en la capa base (las utilidades le ganan) y sin la manija ni los desactivados', () => {
        const presses = declsIn('resources/css/app.css', 'scale').filter(({ rule }) => rule.includes(':active'));

        expect(presses.map(({ value }) => value)).toEqual(['0.97']);

        const [press] = presses;
        expect(press?.media.some((media) => media.includes('prefers-reduced-motion: no-preference'))).toBe(true);
        expect(press?.layers).toContain('base');

        // Lo que excluye va dentro de un :not() de los botones.
        const excluded = /button:not\(([^)]*)\)/.exec(press?.rule ?? '')?.[1] ?? '';
        expect(excluded).toContain(':disabled');
        expect(excluded).toContain('[data-sheet-handle]');
    });

    it('el panel de abajo cambia de alto con el resorte, solo en la variante sheet, en la capa base y no mientras se arrastra', () => {
        const heights = declsIn('resources/css/app.css', 'transition').filter(({ value }) => value.includes('max-height'));

        expect(heights).toHaveLength(1);

        const [height] = heights;
        expect(height?.value).toContain('var(--veni-ease-spring)');
        expect(height?.rule).toMatch(/\[data-sheet\]:not\(\[data-dragging\]\)/);
        expect(height?.media.some((media) => media.includes('prefers-reduced-motion: no-preference'))).toBe(true);
        expect(height?.layers).toContain('base');
        // La media query del panel abajo es la de la variante: no se copia.
        expect(height?.variants).toContain('sheet');
    });

    it('las siluetas laten despacio y solo sin «Reducir movimiento»', () => {
        const [pulse] = declsIn('resources/css/app.css', 'animation').filter(({ rule }) => rule.includes('.veni-skeleton'));

        expect(pulse?.value).toMatch(/^veni-skeleton /);
        expect(pulse?.media.some((media) => media.includes('prefers-reduced-motion: no-preference'))).toBe(true);
    });

    it('con «Reducir movimiento», la capa base deja animaciones y transiciones en 0,01 ms con !important', () => {
        const reduced = declsIn('resources/css/app.css', /^(animation|transition)-duration$/).filter(({ media }) => media.some((query) => query.includes('prefers-reduced-motion: reduce')));

        expect(reduced.map(({ prop, value, important, layers }) => `${prop}: ${value}${important ? ' !important' : ''} @${layers.join(',')}`)).toEqual([
            'animation-duration: 0.01ms !important @base',
            'transition-duration: 0.01ms !important @base',
        ]);
    });

    it('el resorte rebota poco: la curva pasa de 1 sin llegar a 1,5', () => {
        const css = readFileSync('resources/css/app.css', 'utf8');
        const [, x1, y1, x2, y2] = /--veni-ease-spring: cubic-bezier\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/.exec(css) ?? [];

        expect([x1, x2].map(Number).every((x) => x >= 0 && x <= 1)).toBe(true);
        expect(Number(y1)).toBeGreaterThan(1);
        expect(Number(y1)).toBeLessThan(1.5);
        expect(Number(y2)).toBeLessThanOrEqual(1);
    });

    it.each(SHEETS)('%s: la hoja entra con el resorte y su fondo aparece, solo sin «Reducir movimiento»', (file) => {
        const entries: string[] = [];

        for (const root of roots(file)) {
            root.walkDecls('animation', (decl) => {
                entries.push(`${mediaAround(decl).join(' | ')} → ${decl.value}`);
            });
        }

        expect(entries).toHaveLength(2);
        expect(entries.every((entry) => entry.startsWith('(prefers-reduced-motion: no-preference)'))).toBe(true);
        expect(entries[0]).toContain('320ms');
    });

    it.each(SHEETS)('%s: la hoja entra desde abajo sin rebote (el resorte dejaría ver una franja abajo)', (file) => {
        const [entry] = roots(file).flatMap((root) => {
            const found: string[] = [];
            root.walkDecls('animation', (decl) => {
                found.push(decl.value);
            });

            return found;
        });
        const [, , y1, , y2] = /cubic-bezier\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/.exec(entry ?? '') ?? [];

        expect(entry).not.toContain('--veni-ease-spring');
        expect(Number(y1)).toBeLessThanOrEqual(1);
        expect(Number(y2)).toBeLessThanOrEqual(1);
    });
});

describe('base visual (#138, M12)', () => {
    it.each(SHEETS)('%s: la hoja usa el radio de las hojas de la marca (22 px), abajo y centrada', (file) => {
        const radii: string[] = [];

        for (const root of roots(file)) {
            root.walkDecls('border-radius', (decl) => {
                radii.push(decl.value);
            });
        }

        expect(radii.slice(0, 2)).toEqual(['var(--veni-radius-lg) var(--veni-radius-lg) 0 0', 'var(--veni-radius-lg)']);
    });

    it('ningún componente escribe un radio a mano: salen de los tokens de la marca', () => {
        const files = [
            ...SHEETS,
            'resources/js/components/DishPhoto.vue',
            'resources/js/components/DishPhotoViewer.vue',
            'resources/js/components/RestaurantPromotions.vue',
            'resources/js/pages/Restaurants/Show.vue',
        ];
        const literal: string[] = [];

        for (const file of files) {
            for (const root of roots(file)) {
                root.walkDecls('border-radius', (decl) => {
                    if (!decl.value.split(/\s+/).every((part) => part === '0' || /^var\(--veni-radius-(sm|md|lg)\)$/.test(part))) {
                        literal.push(`${file}: ${decl.value}`);
                    }
                });
            }
        }

        expect(literal).toEqual([]);
    });

    it('los radios de la marca son los de la escala: 10, 14 y 22 px', () => {
        const tokens = readFileSync('brand/tokens.css', 'utf8');

        expect([...tokens.matchAll(/--veni-radius-(sm|md|lg): (\d+)px/g)].map(([, name, px]) => `${String(name)} ${String(px)}`)).toEqual(['sm 10', 'md 14', 'lg 22']);
    });
});

/** Contraste WCAG entre dos colores `#RRGGBB`. */
function contrast(a: readonly number[], b: readonly number[]): number {
    const luminance = (rgb: readonly number[]): number => {
        const [r = 0, g = 0, bl = 0] = rgb.map((channel) => {
            const c = channel / 255;

            return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });

        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);

    return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

describe('el «−» de cantidad desactivado (#138, A4)', () => {
    const tokens = readFileSync('brand/tokens.css', 'utf8');
    const hex = (name: string): number[] => {
        const value = new RegExp(`--veni-${name}: #([0-9A-Fa-f]{6})`).exec(tokens)?.[1] ?? '000000';

        return [0, 2, 4].map((at) => Number.parseInt(value.slice(at, at + 2), 16));
    };
    const ciruela = hex('ciruela');
    const blanco = hex('blanco');

    it.each([
        ['resources/js/components/DishPicker.vue', '.dish-picker-step:disabled'],
        ['resources/js/components/OrderCart.vue', '.order-cart-step:disabled'],
    ])('%s: sin opacidad, con el texto mezclado con el fondo a ≥ 3:1 en claro y oscuro, y borde punteado', (file, selector) => {
        const found: Record<string, string> = {};

        for (const root of roots(file)) {
            root.walkRules((rule) => {
                if (rule.selector.replace('[data-v-prueba]', '') === selector) {
                    rule.walkDecls((decl) => {
                        found[decl.prop] = decl.value;
                    });
                }
            });
        }

        expect(found.opacity).toBeUndefined();
        expect(found['border-style']).toBe('dashed');
        expect(found['border-color']).toBe('currentColor');

        const share = Number(/color-mix\(in srgb, var\(--color-ink\) (\d+)%, var\(--color-canvas\)\)/.exec(found.color ?? '')?.[1]) / 100;
        const mix = (ink: readonly number[], canvas: readonly number[]): number[] => ink.map((channel, index) => Math.round(channel * share + (canvas[index] ?? 0) * (1 - share)));

        // Claro: tinta ciruela sobre blanco. Oscuro: tinta blanca sobre ciruela.
        expect(contrast(mix(ciruela, blanco), blanco)).toBeGreaterThanOrEqual(3);
        expect(contrast(mix(blanco, ciruela), ciruela)).toBeGreaterThanOrEqual(3);
    });
});
