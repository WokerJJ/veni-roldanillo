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

describe('CSS scoped de los componentes (BUG-033)', () => {
    it.each([
        ['resources/js/pages/Restaurants/Show.vue', []],
        ['resources/js/components/DishPicker.vue', []],
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

    it('en computador la barra del pedido va sobre la columna del menú: la columna de la derecha no se acorta por ella (EVA-037)', () => {
        expect(compiledSelectors('resources/js/pages/Restaurants/Show.vue').filter((selector) => selector.includes('has-order-bar'))).toEqual([]);
    });
});
