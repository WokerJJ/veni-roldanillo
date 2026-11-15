import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IngredientChip } from '@/order/ingredients';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/*
| El tope de chips de la carta del celular (#141, M8): los normales hasta el
| `limit`, los cambiados siempre, y «+n» por los que quedan fuera.
*/

enableAutoUnmount(afterEach);

const present = (name: string): IngredientChip => ({ kind: 'present', name, icon: name });
const missing = (name: string): IngredientChip => ({ kind: 'missing', name, icon: name });
const swap = (name: string): IngredientChip => ({ kind: 'swap', name, substitute: 'Otro', price: 0, icon: name });

async function render(chips: IngredientChip[], limit: number | null) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer('es', { replace: true });
    const { default: IngredientChips } = await import('./IngredientChips.vue');

    return mount(IngredientChips, { props: { chips, limit } });
}

const names = (wrapper: Awaited<ReturnType<typeof render>>) => wrapper.findAll('[data-ingredient-chip]').map((chip) => chip.attributes('data-ingredient-chip'));

describe('IngredientChips: el tope (limit)', () => {
    const five = ['Arroz', 'Frijol', 'Carne', 'Yuca', 'Aguacate'].map(present);

    it('sin tope (null) muestra todos y no hay «+n»', async () => {
        const wrapper = await render(five, null);

        expect(names(wrapper)).toHaveLength(5);
        expect(wrapper.find('[data-ingredient-more]').exists()).toBe(false);
        expect(wrapper.classes()).not.toContain('ingredient-chips-line');
    });

    it('con exactamente el tope no hay «+n»', async () => {
        const wrapper = await render(five.slice(0, 3), 3);

        expect(names(wrapper)).toHaveLength(3);
        expect(wrapper.find('[data-ingredient-more]').exists()).toBe(false);
    });

    it('pasado el tope, muestra los primeros y «+n» por el resto, también dicho a un lector de pantalla', async () => {
        const wrapper = await render(five, 3);

        expect(wrapper.findAll('[data-ingredient-chip]').map((chip) => chip.text())).toEqual(['Arroz,', 'Frijol,', 'Carne,']);
        expect(wrapper.get('[data-ingredient-more]').text()).toContain('+2');
        expect(wrapper.get('[data-ingredient-more] .sr-only').text()).not.toBe('');
        expect(wrapper.get('[data-ingredient-more] [aria-hidden="true"]').text()).toBe('+2');
    });

    it('lo que hoy no hay sale siempre; con más cambiados que el tope no entra ningún normal', async () => {
        const wrapper = await render([present('Arroz'), missing('Carne'), swap('Yuca'), missing('Papa'), present('Frijol')], 2);

        expect(names(wrapper)).toEqual(['missing', 'swap', 'missing']);
        expect(wrapper.get('[data-ingredient-more]').text()).toContain('+2');
    });

    it('los cambiados ocupan parte del tope y los normales, el resto, en el orden del dueño', async () => {
        const wrapper = await render([present('Arroz'), missing('Carne'), present('Frijol'), present('Yuca')], 3);

        expect(names(wrapper)).toEqual(['present', 'missing', 'present']);
        expect(wrapper.get('[data-ingredient-more]').text()).toContain('+1');
    });

    it('la fila va en una línea solo si no hay cambiados', async () => {
        expect((await render(five, 3)).classes()).toContain('ingredient-chips-line');
        expect((await render([present('Arroz'), missing('Carne')], 3)).classes()).not.toContain('ingredient-chips-line');
    });
});
