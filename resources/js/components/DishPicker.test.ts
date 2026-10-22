import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrderItem } from '@/order/selection';
import type { MenuDish } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';
import { nth, present } from '@/testing/present';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

const SANCOCHO: MenuDish = {
    name: 'Sancocho de prueba',
    description: 'Con arroz y aguacate.',
    price: 18500,
    sold_out_until: null,
    groups: [
        { name: 'Proteína (prueba)', kind: 'choice', min: 1, max: 1, options: [{ name: 'Res (prueba)', price: 0 }, { name: 'Cerdo (prueba)', price: 1000 }] },
        { name: 'Adiciones (prueba)', kind: 'choice', min: 0, max: 2, options: [{ name: 'Huevo (prueba)', price: 1500 }, { name: 'Aguacate (prueba)', price: 2000 }, { name: 'Maduro (prueba)', price: 1500 }] },
        { name: 'Quitar (prueba)', kind: 'removal', min: 0, max: 2, options: [{ name: 'Cebolla (prueba)', price: 0 }, { name: 'Cilantro (prueba)', price: 0 }] },
    ],
};

/** Los espacios que no parten la línea («$ 18.500», «COP 18,500») como uno común. */
function plain(text: string): string {
    return text.replace(/[\u00a0\u202f]/g, ' ');
}

async function mountPicker(dish: MenuDish = SANCOCHO, locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: DishPicker } = await import('./DishPicker.vue');
    const wrapper = mount(DishPicker, { props: { dish }, attachTo: document.body });
    const group = (index: number) => nth(wrapper.findAll('fieldset'), index);

    return {
        wrapper,
        group,
        option: (groupIndex: number, optionIndex: number) => nth(group(groupIndex).findAll('[data-option]'), optionIndex),
        // El espacio que no parte la línea de «$ 18.500» se compara como uno común.
        addText: () => plain(wrapper.get('[data-add]').text()),
        added: () => (wrapper.emitted('add') ?? []).map(([item]) => item as OrderItem),
    };
}

enableAutoUnmount(afterEach);

describe('DishPicker', () => {
    it('abre como diálogo modal con el nombre del plato y el foco en el título', async () => {
        const { wrapper } = await mountPicker();
        const dialog = wrapper.get('dialog');
        const title = wrapper.get('h2');

        expect(dialog.element.open).toBe(true);
        expect(dialog.attributes('aria-labelledby')).toBe(title.attributes('id'));
        expect(title.text()).toBe('Sancocho de prueba');
        expect(document.activeElement).toBe(title.element);
    });

    it('cada grupo es un fieldset con su nombre y lo que pide', async () => {
        const { group } = await mountPicker();

        expect(group(0).get('legend').text()).toBe('Proteína (prueba)');
        expect(group(0).text()).toContain('Obligatorio · Elegí 1');
        expect(group(1).text()).toContain('Opcional · Hasta 2');
        expect(group(2).text()).toContain('Tocá lo que no querés');
        // La pista es la descripción del grupo.
        const hintId = group(0).attributes('aria-describedby');
        expect(hintId).toBeDefined();
        expect(group(0).get(`[id="${present(hintId)}"]`).text()).toBe('Obligatorio · Elegí 1');
    });

    it('la proteína es de radio; adiciones y quitar, casillas; quitar dice «Sin …» y no muestra precio', async () => {
        const { group, option } = await mountPicker();

        expect(option(0, 0).attributes('type')).toBe('radio');
        expect(option(1, 0).attributes('type')).toBe('checkbox');
        expect(option(2, 0).attributes('type')).toBe('checkbox');
        expect(group(2).text()).toContain('Sin Cebolla (prueba)');
        expect(group(2).text()).not.toContain('$');
        expect(plain(group(1).text())).toContain('+ $ 1.500');
    });

    it('recalcula el precio con cada toque y con la cantidad', async () => {
        const { option, addText, wrapper } = await mountPicker();

        expect(addText()).toBe('Agregar · $ 18.500');

        await option(0, 1).setValue(true);
        await option(1, 1).setValue(true);
        await option(2, 0).setValue(true);
        expect(addText()).toBe('Agregar · $ 21.500');

        await wrapper.get('[data-increase]').trigger('click');
        expect(wrapper.get('[data-quantity]').text()).toBe('2');
        expect(addText()).toBe('Agregar · $ 43.000');
    });

    it('con el grupo lleno, las demás casillas quedan deshabilitadas', async () => {
        const { option } = await mountPicker();

        await option(1, 0).setValue(true);
        await option(1, 1).setValue(true);

        expect(option(1, 2).attributes('disabled')).toBeDefined();
        expect(option(1, 0).attributes('disabled')).toBeUndefined();
    });

    it('sin la obligatoria no agrega: lo dice en el grupo, lo anuncia y lleva el foco ahí', async () => {
        const { wrapper, group, option, added } = await mountPicker();

        await wrapper.get('form').trigger('submit');
        await flushPromises();

        expect(added()).toEqual([]);
        expect(group(0).get('[data-error]').text()).toBe('Elegí una opción.');
        expect(group(0).attributes('aria-describedby')).toContain(group(0).get('[data-error]').attributes('id'));
        expect(wrapper.get('[role="alert"]').text()).toBe('Revisá lo que falta antes de agregar.');
        expect(document.activeElement).toBe(option(0, 0).element);
        // Los grupos sin problema no muestran error.
        expect(group(1).find('[data-error]').exists()).toBe(false);
    });

    it('agrega el ítem con lo elegido, lo quitado, la nota y la cantidad', async () => {
        const { wrapper, option, added } = await mountPicker();

        await option(0, 0).setValue(true);
        await option(1, 0).setValue(true);
        await option(2, 1).setValue(true);
        await wrapper.get('[data-note]').setValue('  bien   caliente ');
        await wrapper.get('[data-increase]').trigger('click');
        await wrapper.get('form').trigger('submit');

        expect(added()).toEqual([
            {
                dish: 'Sancocho de prueba',
                unitPrice: 20000,
                quantity: 2,
                choices: [
                    { group: 'Proteína (prueba)', name: 'Res (prueba)', price: 0 },
                    { group: 'Adiciones (prueba)', name: 'Huevo (prueba)', price: 1500 },
                ],
                removed: ['Cilantro (prueba)'],
                note: 'bien caliente',
            },
        ]);
    });

    it('la nota tiene un largo máximo y cuenta los caracteres', async () => {
        const { wrapper } = await mountPicker();
        const note = wrapper.get('[data-note]');

        expect(note.attributes('maxlength')).toBe('140');
        await note.setValue('sin hielo');
        expect(wrapper.text()).toContain('9 de 140 caracteres');
        expect(wrapper.get(`label[for="${present(note.attributes('id'))}"]`).text()).toBe('Nota para el restaurante');
    });

    it('la cantidad va de 1 a 20', async () => {
        const { wrapper } = await mountPicker({ ...SANCOCHO, groups: [] });
        const decrease = wrapper.get('[data-decrease]');
        const increase = wrapper.get('[data-increase]');

        expect(decrease.attributes('disabled')).toBeDefined();

        for (let i = 0; i < 25; i++) {
            await increase.trigger('click');
        }

        expect(wrapper.get('[data-quantity]').text()).toBe('20');
        expect(increase.attributes('disabled')).toBeDefined();
        expect(decrease.attributes('aria-label')).toBe('Una menos');
    });

    it('cerrar, Escape o un toque en el fondo avisan que se cierra', async () => {
        const { wrapper } = await mountPicker();

        await wrapper.get('[data-close]').trigger('click');
        wrapper.get('dialog').element.dispatchEvent(new Event('cancel', { cancelable: true }));
        await wrapper.get('dialog').trigger('click');
        // Un toque dentro de la hoja no cierra.
        await wrapper.get('h2').trigger('click');

        expect(wrapper.emitted('close')).toHaveLength(3);
    });

    it('en inglés', async () => {
        const { wrapper, addText } = await mountPicker(SANCOCHO, 'en');

        expect(wrapper.text()).toContain('Required · Choose 1');
        expect(wrapper.text()).toContain('No Cebolla (prueba)');
        expect(addText()).toBe('Add · COP 18,500');
        expect(wrapper.get('[data-close]').attributes('aria-label')).toBe('Close');
    });
});
