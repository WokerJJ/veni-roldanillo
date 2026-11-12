import { readFileSync } from 'node:fs';

import { compileStyle, parse } from 'vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

/**
 * El CSS `scoped` como lo compila Vue (BUG-033). `:global(x) .y` no queda
 * «x .y con .y del componente»: Vue descarta lo que sigue al `:global()` y
 * escribe la regla para `x` solo, que pisa la página entera. Lo que va detrás
 * de un ancestro global se escribe sin `:global()` (`x .y`): Vue le pone el
 * atributo del componente a `.y`, el último selector.
 */
const ID = 'data-v-prueba';
const SCOPE = `[${ID}]`;

/** Los selectores de los `<style scoped>` de un componente, ya compilados (sin los de @keyframes). */
function compiledSelectors(file: string): string[] {
    const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file });

    return descriptor.styles
        .filter((style) => style.scoped)
        .flatMap((style) => {
            const { code, errors } = compileStyle({ source: style.content, filename: file, id: ID, scoped: true });
            expect(errors).toEqual([]);
            const css = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');

            return [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)]
                .map(([, selector]) => (selector ?? '').trim())
                .filter((selector) => selector !== '' && !selector.startsWith('@'))
                .flatMap((selector) => selector.split(',').map((part) => part.trim()));
        });
}

/**
 * Las declaraciones de una regla como la compila Vue, leídas del árbol de
 * postcss y no del texto: no dependen de espacios, orden ni comentarios
 * (EVA-050). `media` es el `@media` que la contiene, o null si va suelta.
 */
function declarations(file: string, selector: string, media: string | null = null): Record<string, string> {
    const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file });
    const found: Record<string, string> = {};

    for (const style of descriptor.styles) {
        const { rawResult, errors } = compileStyle({ source: style.content, filename: file, id: ID, scoped: style.scoped === true });
        expect(errors).toEqual([]);
        rawResult?.root.walkRules((rule) => {
            const parent = rule.parent;
            const inMedia = parent !== undefined && parent.type === 'atrule' && 'params' in parent ? parent.params : null;

            if (rule.selectors.includes(`${selector}${style.scoped === true ? SCOPE : ''}`) && inMedia === media) {
                rule.walkDecls((decl) => {
                    found[decl.prop] = decl.value;
                });
            }
        });
    }

    return found;
}

describe('CSS scoped de los componentes (BUG-033)', () => {
    it.each([
        ['resources/js/pages/Restaurants/Show.vue', []],
        ['resources/js/components/DishPicker.vue', []],
        ['resources/js/components/DishPhotoViewer.vue', []],
        ['resources/js/components/DishPhoto.vue', []],
        ['resources/js/components/OrderCart.vue', []],
        ['resources/js/components/SavedOnDevice.vue', []],
        ['resources/js/components/RestaurantHours.vue', []],
        // El margen de abajo mientras está la barra del pedido es de la página entera: va en <html> a propósito.
        ['resources/js/components/OrderBar.vue', ['html.has-order-bar']],
    ])('%s: cada regla apunta a un elemento del componente', (file, global) => {
        expect(compiledSelectors(file).filter((selector) => !selector.includes(SCOPE))).toEqual(global);
    });

    it.each([
        ['resources/js/components/DishPicker.vue', '.dish-picker-check'],
        ['resources/js/components/OrderCart.vue', '.order-cart-check'],
        ['resources/js/components/SavedOnDevice.vue', '.saved-check'],
    ])('%s: en el tema oscuro, el color de las casillas es el de las casillas, no el de la página', (file, check) => {
        expect(compiledSelectors(file)).toContain(`[data-theme='dark'] ${check}${SCOPE}`);
    });

    it('desde 1024 px la miniatura del plato mide 96 px, y antes 64 (#126)', () => {
        const file = 'resources/js/components/DishPhoto.vue';

        expect(declarations(file, '.dish-photo-thumb')).toMatchObject({ width: '4rem', height: '4rem' });
        expect(declarations(file, '.dish-photo-thumb', '(min-width: 1024px)')).toMatchObject({ width: '6rem', height: '6rem' });
    });

    it('la foto grande del selector va de borde a borde, en 4:3 y con un tope de 40dvh: no alarga el diálogo ni tapa las opciones (#126, #141)', () => {
        expect(declarations('resources/js/components/DishPhoto.vue', '.dish-photo-large')).toMatchObject({ width: '100%', 'aspect-ratio': '4 / 3', 'max-height': '40dvh' });
        expect(declarations('resources/js/components/DishPicker.vue', '.dish-picker-zoom')).toMatchObject({ width: 'calc(100% + 2rem)', 'margin-inline': '-1rem' });
    });

    it('el pie del selector deja el espacio del indicador de inicio del iPhone (BUG-001)', () => {
        expect(declarations('resources/js/components/DishPicker.vue', '.dish-picker-footer')).toMatchObject({
            padding: '0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px))',
        });
    });

    it('las secciones de la ficha saltan por debajo de la barra fija y en computador, sin barra, a 1 rem (EVA-001)', () => {
        const show = 'resources/js/pages/Restaurants/Show.vue';
        const bar = 'calc(env(safe-area-inset-top, 0px) + 4rem)';

        expect(declarations(show, '.ficha')).toMatchObject({ '--ficha-tabs-offset': bar });
        expect(declarations(show, '.ficha-section')).toMatchObject({ 'scroll-margin-top': 'var(--ficha-tabs-offset)' });
        expect(declarations(show, '.ficha-section', '(min-width: 64rem)')).toMatchObject({ 'scroll-margin-top': '1rem' });
        expect(declarations('resources/js/components/RestaurantMenu.vue', '.menu-section')).toMatchObject({
            'scroll-margin-top': `var(--ficha-tabs-offset, ${bar})`,
        });
    });

    it('las pestañas de la ficha se quedan debajo de la cabecera chica del celular, no encima de ella (#141)', () => {
        const top = declarations('resources/js/pages/Restaurants/Show.vue', '.ficha-tabs').top ?? '';

        expect(declarations('resources/js/pages/Restaurants/Show.vue', '.ficha-tabs').position).toBe('sticky');
        expect(top).toContain('env(safe-area-inset-top, 0px)');
        expect(top).toContain('var(--veni-touch-min)');
        // La cabecera chica mide eso: el margen del sistema, su enlace de 44 px y el borde.
        expect(declarations('resources/js/components/CompactHeader.vue', '.compact-back')).toMatchObject({ 'min-height': 'var(--veni-touch-min)' });
    });

    it('en una línea, se angosta primero el último chip y el «+n» nunca (#141)', () => {
        const file = 'resources/js/components/IngredientChips.vue';

        expect(declarations(file, '.ingredient-chips-line .ingredient-chip-last')).toMatchObject({ 'flex-shrink': '1000' });
        expect(declarations(file, '.ingredient-chips-line .ingredient-chip-more')).toMatchObject({ 'flex-shrink': '0' });
    });

    it('en computador la barra del pedido va sobre la columna del menú: la columna de la derecha no se acorta por ella (EVA-037)', () => {
        expect(compiledSelectors('resources/js/pages/Restaurants/Show.vue').filter((selector) => selector.includes('has-order-bar'))).toEqual([]);
    });
});
