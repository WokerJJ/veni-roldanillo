import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

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

    it('una adición opcional de una sola opción es casilla y se puede desmarcar', async () => {
        const dish: MenuDish = {
            ...SANCOCHO,
            groups: [{ name: 'Adición (prueba)', kind: 'choice', min: 0, max: 1, options: [{ name: 'Huevo (prueba)', price: 1500 }, { name: 'Maduro (prueba)', price: 1500 }] }],
        };
        const { option, addText } = await mountPicker(dish);

        expect(option(0, 0).attributes('type')).toBe('checkbox');

        await option(0, 0).setValue(true);
        expect(addText()).toBe('Agregar · $ 20.000');

        await option(0, 0).setValue(false);
        expect(addText()).toBe('Agregar · $ 18.500');
    });

    it('si el plato se agota con el selector abierto, no agrega y lo anuncia', async () => {
        const { wrapper, added } = await mountPicker({ ...SANCOCHO, groups: [] });

        await wrapper.setProps({ unavailable: { reason: 'sold_out' } });
        await wrapper.get('form').trigger('submit');
        await flushPromises();

        expect(added()).toEqual([]);
        expect(wrapper.get('[role="alert"]').text()).toBe('Este plato se agotó: ya no se puede agregar.');
    });

    it('si se queda sin un ingrediente esencial con el selector abierto, dice cuál (EVA-004)', async () => {
        const { wrapper, added } = await mountPicker({ ...SANCOCHO, groups: [] });

        await wrapper.setProps({ unavailable: { reason: 'ingredient', name: 'Arroz (prueba)' } });
        await wrapper.get('form').trigger('submit');
        await flushPromises();

        expect(added()).toEqual([]);
        expect(wrapper.get('[role="alert"]').text()).toBe('Hoy no hay Arroz (prueba): este plato ya no se puede agregar.');

        await wrapper.setProps({ unavailable: { reason: 'options' } });
        await wrapper.get('form').trigger('submit');
        await flushPromises();

        expect(wrapper.get('[role="alert"]').text()).toBe('Este plato hoy no se puede pedir: ya no se puede agregar.');
    });

    it('arrastrar desde la hoja y soltar en el fondo no cierra', async () => {
        const { wrapper } = await mountPicker();
        const dialog = wrapper.get('dialog');

        // Empieza en la nota (seleccionar texto) y el click cae en el fondo.
        await wrapper.get('[data-note]').trigger('pointerdown');
        await dialog.trigger('click');
        expect(wrapper.emitted('close')).toBeUndefined();

        // Empieza y termina en el fondo: cierra.
        await dialog.trigger('pointerdown');
        await dialog.trigger('click');
        expect(wrapper.emitted('close')).toHaveLength(1);
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
        await wrapper.get('dialog').trigger('pointerdown');
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

describe('DishPicker: ingredientes agotados hoy (ADR 0033)', () => {
    const TODAY = '2026-10-07';
    const BANDEJA: MenuDish = {
        ...SANCOCHO,
        name: 'Bandeja de prueba',
        ingredients: [
            { name: 'Tomate (prueba)', essential: false, in_dish: true, sold_out_until: TODAY, substitute: { name: 'Pepino (prueba)', price: 500, sold_out_until: null } },
            { name: 'Cebolla (prueba)', essential: false, in_dish: true, sold_out_until: TODAY, substitute: null },
            { name: 'Aguacate (prueba)', essential: false, in_dish: false, sold_out_until: TODAY, substitute: null },
        ],
        groups: [
            nth(SANCOCHO.groups, 0),
            { ...nth(SANCOCHO.groups, 1), options: [{ name: 'Huevo (prueba)', price: 1500, ingredient: null }, { name: 'Aguacate (prueba)', price: 2000, ingredient: 2 }] },
            { ...nth(SANCOCHO.groups, 2), options: [{ name: 'Cebolla (prueba)', price: 0, ingredient: 1 }, { name: 'Cilantro (prueba)', price: 0, ingredient: null }] },
        ],
    };

    async function mountToday() {
        const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
        inertia.reset();
        inertia.receiveFromServer('es', { replace: true });

        const { default: DishPicker } = await import('./DishPicker.vue');

        return mount(DishPicker, { props: { dish: BANDEJA, today: TODAY }, attachTo: document.body });
    }

    it('ofrece el reemplazo con su recargo, deja fija la cebolla y no deja elegir el aguacate', async () => {
        const wrapper = await mountToday();
        const swap = wrapper.get('[data-substitute]');

        expect(swap.get('legend').text()).toBe('Hoy no hay Tomate (prueba)');
        expect(plain(swap.get('[data-swap="accept"]').element.closest('label')?.textContent ?? '')).toContain('Pepino (prueba) en lugar de Tomate (prueba) · + $ 500');
        expect((swap.get('[data-swap="accept"]').element as HTMLInputElement).checked).toBe(true);
        expect(wrapper.get('[data-ingredient-note]').text()).toBe('Hoy sin Cebolla (prueba)');

        const options = wrapper.findAll('[data-option]');
        // Proteína (2), adiciones (2), quitar (2).
        const aguacate = nth(options, 3).element as HTMLInputElement;
        const cebolla = nth(options, 4).element as HTMLInputElement;

        expect(aguacate.disabled).toBe(true);
        expect(aguacate.checked).toBe(false);
        expect(cebolla.disabled).toBe(true);
        expect(cebolla.checked).toBe(true);
        expect(wrapper.findAll('[data-out-today]')).toHaveLength(2);
        expect(plain(wrapper.get('[data-add]').text())).toContain('$ 19.000');
    });

    it('agrega con el reemplazo aceptado y, si lo rechaza, sin nada', async () => {
        const wrapper = await mountToday();

        await nth(wrapper.findAll('[data-option]'), 0).setValue(true);
        await wrapper.get('form').trigger('submit');
        await wrapper.get('[data-swap="decline"]').setValue(true);
        await wrapper.get('form').trigger('submit');

        const added = (wrapper.emitted('add') ?? []).map(([item]) => item as OrderItem);

        expect(added[0]).toMatchObject({ unitPrice: 19000, removed: [], missing: ['Cebolla (prueba)'], swaps: [{ name: 'Pepino (prueba)', instead: 'Tomate (prueba)', price: 500 }] });
        expect(added[1]).toMatchObject({ unitPrice: 18500, removed: [], missing: ['Tomate (prueba)', 'Cebolla (prueba)'] });
        expect(added[1]?.swaps).toBeUndefined();
    });

    async function mountWith(dish: MenuDish) {
        const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
        inertia.reset();
        inertia.receiveFromServer('es', { replace: true });

        const { default: DishPicker } = await import('./DishPicker.vue');

        return mount(DishPicker, { props: { dish, today: TODAY }, attachTo: document.body });
    }

    it('un esencial con reemplazo va con el reemplazo: no ofrece pedirlo sin nada (EVA-003)', async () => {
        const wrapper = await mountWith({
            ...BANDEJA,
            ingredients: [{ name: 'Res (prueba)', essential: true, in_dish: true, sold_out_until: TODAY, substitute: { name: 'Cerdo (prueba)', price: 1000, sold_out_until: null } }],
            groups: [],
        });
        const swap = wrapper.get('[data-substitute]');

        expect(swap.find('[data-swap="decline"]').exists()).toBe(false);
        expect((swap.get('[data-swap="accept"]').element as HTMLInputElement).checked).toBe(true);
        expect(swap.get('p').text()).toBe('Hoy va con el reemplazo.');

        await wrapper.get('form').trigger('submit');

        expect((wrapper.emitted('add') ?? []).map(([item]) => item as OrderItem)[0]).toMatchObject({
            unitPrice: 19500,
            swaps: [{ name: 'Cerdo (prueba)', instead: 'Res (prueba)', price: 1000 }],
        });
    });

    it('con reemplazo, el «Quitar» de ese ingrediente no sale: decide el grupo del reemplazo (EVA-005)', async () => {
        const wrapper = await mountWith({
            ...BANDEJA,
            ingredients: [{ name: 'Cebolla (prueba)', essential: false, in_dish: true, sold_out_until: TODAY, substitute: { name: 'Cebollín (prueba)', price: 0, sold_out_until: null } }],
            groups: [nth(BANDEJA.groups, 0), { ...nth(BANDEJA.groups, 2), options: [{ name: 'Cebolla (prueba)', price: 0, ingredient: 0 }, { name: 'Cilantro (prueba)', price: 0, ingredient: null }] }],
        });
        const removal = nth(wrapper.findAll('[data-group]'), 1);

        expect(removal.findAll('[data-option]')).toHaveLength(1);
        expect(removal.text()).not.toContain('Cebolla');
        expect(removal.text()).toContain('Cilantro (prueba)');
        expect(wrapper.find('[data-out-today]').exists()).toBe(false);

        await nth(wrapper.findAll('[data-option]'), 0).setValue(true);
        await wrapper.get('[data-swap="decline"]').setValue(true);
        await wrapper.get('form').trigger('submit');

        expect((wrapper.emitted('add') ?? []).map(([item]) => item as OrderItem)[0]).toMatchObject({ removed: [], missing: ['Cebolla (prueba)'] });
    });
});

describe('DishPicker: la foto grande del plato (#126)', () => {
    const PHOTO = {
        src: '/storage/media/dishes/0123456789abcdef0123-480.webp',
        srcset: '/storage/media/dishes/0123456789abcdef0123-192.webp 192w, /storage/media/dishes/0123456789abcdef0123-480.webp 480w, /storage/media/dishes/0123456789abcdef0123-960.webp 960w',
    };
    const WITH_PHOTO: MenuDish = { ...SANCOCHO, photo: PHOTO };

    async function openViewer() {
        const picker = await mountPicker(WITH_PHOTO);
        await picker.wrapper.get('[data-zoom]').trigger('click');
        await flushPromises();

        return { ...picker, viewer: () => picker.wrapper.find('[data-photo-viewer]') };
    }

    it('arriba del detalle, la foto con los tres anchos, el nombre como texto alternativo y un botón que dice que la amplía', async () => {
        const { wrapper } = await mountPicker(WITH_PHOTO);
        const zoom = wrapper.get('[data-zoom]');
        const img = zoom.get('img');

        expect(zoom.element.tagName).toBe('BUTTON');
        expect(zoom.attributes('aria-label')).toBe('Ver la foto de Sancocho de prueba en grande');
        expect(img.attributes()).toMatchObject({
            srcset: PHOTO.srcset,
            sizes: '(min-width: 32rem) 32rem, 100vw',
            alt: 'Sancocho de prueba',
            width: '480',
            height: '480',
            decoding: 'async',
        });
        // Va dentro de lo que se desplaza, antes de las opciones: no alarga el diálogo.
        expect(zoom.element.closest('.overflow-y-auto')).not.toBeNull();
        expect(zoom.element.compareDocumentPosition(wrapper.get('fieldset').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('al tocarla abre la vista a pantalla completa, con nombre, la foto grande y el foco en «Cerrar»', async () => {
        const { viewer } = await openViewer();
        const dialog = viewer();

        expect(dialog.element.tagName).toBe('DIALOG');
        expect((dialog.element as HTMLDialogElement).open).toBe(true);
        expect(dialog.attributes('aria-label')).toBe('Foto de Sancocho de prueba');
        expect(dialog.get('img').attributes()).toMatchObject({ srcset: PHOTO.srcset, sizes: '(min-aspect-ratio: 1/1) 100vh, 100vw', alt: 'Sancocho de prueba' });
        expect(document.activeElement).toBe(dialog.get('[data-viewer-close]').element);
        expect(dialog.get('[data-viewer-close]').attributes('aria-label')).toBe('Cerrar');
    });

    it('Escape cierra la vista y no el detalle, y el foco vuelve a la foto', async () => {
        const { wrapper, viewer } = await openViewer();
        viewer().element.dispatchEvent(new Event('cancel', { cancelable: true }));
        await flushPromises();

        expect(viewer().exists()).toBe(false);
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(wrapper.get('dialog').element.open).toBe(true);
        expect(document.activeElement).toBe(wrapper.get('[data-zoom]').element);
    });

    it('«Cerrar» y un toque fuera de la foto la cierran; un toque en la foto, no', async () => {
        const { wrapper, viewer } = await openViewer();

        await viewer().get('img').trigger('click');
        expect(viewer().exists()).toBe(true);

        await viewer().get('[data-viewer-close]').trigger('click');
        await flushPromises();
        expect(viewer().exists()).toBe(false);
        expect(document.activeElement).toBe(wrapper.get('[data-zoom]').element);

        await wrapper.get('[data-zoom]').trigger('click');
        await flushPromises();
        await viewer().trigger('pointerdown');
        await viewer().trigger('click');
        await flushPromises();
        expect(viewer().exists()).toBe(false);
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('un click que no empezó en el fondo de la vista (arrastrar desde la foto y soltar afuera) no la cierra (BUG-042)', async () => {
        const { viewer } = await openViewer();

        await viewer().trigger('click');
        expect(viewer().exists()).toBe(true);

        await viewer().get('img').trigger('pointerdown');
        await viewer().trigger('click');
        expect(viewer().exists()).toBe(true);
    });

    it('si el navegador cierra la vista por su cuenta (close nativo), se desmonta y la foto la vuelve a abrir (EVA-047)', async () => {
        const { wrapper, viewer } = await openViewer();

        (viewer().element as HTMLDialogElement).close();
        await flushPromises();
        expect(viewer().exists()).toBe(false);
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(document.activeElement).toBe(wrapper.get('[data-zoom]').element);

        await wrapper.get('[data-zoom]').trigger('click');
        await flushPromises();
        expect(viewer().exists()).toBe(true);
        expect((viewer().element as HTMLDialogElement).open).toBe(true);

        viewer().element.dispatchEvent(new Event('close'));
        await flushPromises();
        expect(viewer().exists()).toBe(false);
    });

    it('si el navegador cierra el selector por su cuenta (close nativo), avisa que se cerró (EVA-047)', async () => {
        const { wrapper } = await mountPicker(WITH_PHOTO);

        wrapper.get('dialog').element.close();

        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('Tab no saca el foco de la vista', async () => {
        const { viewer } = await openViewer();
        const close = viewer().get('[data-viewer-close]').element;
        document.body.focus();

        const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        viewer().element.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(close);
    });

    it('sin foto, el ícono del plato más chico y sin ampliar', async () => {
        const { wrapper } = await mountPicker(SANCOCHO);
        await flushPromises();
        const icon = wrapper.get('[data-photo="placeholder"]');

        expect(wrapper.find('[data-zoom]').exists()).toBe(false);
        expect(icon.classes()).toContain('dish-photo-thumb');
        expect(icon.get('svg').attributes('data-icon')).toBe('sancocho');
        expect(icon.element.closest('button')).toBeNull();

        await icon.trigger('click');
        expect(wrapper.find('[data-photo-viewer]').exists()).toBe(false);
    });
});

describe('DishPicker: la hoja del celular (#141, M9)', () => {
    /** Un evento de puntero con su hora (happy-dom no deja pasarla al crearlo). */
    async function pointer(target: { element: Element }, type: string, clientY: number, time: number): Promise<void> {
        const event = new PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, clientY, bubbles: true });
        Object.defineProperty(event, 'timeStamp', { value: time });
        target.element.dispatchEvent(event);
        await nextTick();
    }

    /** Desliza la manija de `from` a `to`; despacio, quieta medio segundo antes de soltar. */
    async function slide(wrapper: Awaited<ReturnType<typeof mountPicker>>['wrapper'], from: number, to: number, { slow = false } = {}): Promise<void> {
        const grab = wrapper.get('[data-grab]');

        await pointer(grab, 'pointerdown', from, 0);
        await pointer(grab, 'pointermove', (from + to) / 2, Math.abs(to - from) / 2);
        await pointer(grab, 'pointermove', to, Math.abs(to - from));
        await pointer(grab, 'pointerup', to, Math.abs(to - from) + (slow ? 500 : 5));
    }

    beforeEach(() => {
        // La captura del puntero, sin efecto: aquí no hay un dedo que se salga de la manija.
        Object.assign(Element.prototype, { setPointerCapture: () => undefined });
    });

    it('la manija es decorativa para el lector y no es un control: el teclado cierra con «Cerrar» o Escape', async () => {
        const { wrapper } = await mountPicker();
        const grab = wrapper.get('[data-grab]');

        expect(grab.attributes('aria-hidden')).toBe('true');
        expect(grab.element.tagName).toBe('DIV');
        expect(wrapper.get('[data-close]').attributes('aria-label')).toBe('Cerrar');
        // El «Cerrar» va antes que lo demás en el documento.
        expect(wrapper.get('form').element.querySelector('[data-close]')?.compareDocumentPosition(wrapper.get('[data-add]').element)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('mientras se desliza, la hoja sigue al dedo hacia abajo y no sube', async () => {
        const { wrapper } = await mountPicker();
        const dialog = wrapper.get('dialog');
        const grab = wrapper.get('[data-grab]');

        await pointer(grab, 'pointerdown', 100, 0);
        await pointer(grab, 'pointermove', 160, 20);

        expect(dialog.attributes('style')).toContain('translate: 0 60px');
        expect(dialog.attributes('data-dragging')).toBeDefined();

        await pointer(grab, 'pointermove', 40, 40);

        expect(dialog.attributes('style')).toContain('translate: 0 0px');
    });

    it('deslizada lejos, se cierra', async () => {
        const { wrapper } = await mountPicker();

        await slide(wrapper, 100, 300, { slow: true });

        expect(wrapper.emitted('close')).toHaveLength(1);
        expect(wrapper.get('dialog').attributes('style')).toBeUndefined();
    });

    it('deslizada corta y despacio, vuelve a su lugar y no cierra', async () => {
        const { wrapper } = await mountPicker();

        await slide(wrapper, 100, 150, { slow: true });

        expect(wrapper.emitted('close')).toBeUndefined();
        expect(wrapper.get('dialog').attributes('style')).toBeUndefined();
        expect(wrapper.get('dialog').attributes('data-dragging')).toBeUndefined();
    });

    it('un golpe rápido hacia abajo cierra aunque sea corto', async () => {
        const { wrapper } = await mountPicker();

        // 60 px en 5 ms.
        await slide(wrapper, 100, 160);

        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('un toque quieto o un gesto cancelado no cierran', async () => {
        const { wrapper } = await mountPicker();
        const grab = wrapper.get('[data-grab]');

        await pointer(grab, 'pointerdown', 100, 0);
        await pointer(grab, 'pointerup', 100, 5);
        await pointer(grab, 'pointerdown', 100, 10);
        await pointer(grab, 'pointermove', 400, 15);
        await pointer(grab, 'pointercancel', 400, 20);

        expect(wrapper.emitted('close')).toBeUndefined();
        expect(wrapper.get('dialog').attributes('style')).toBeUndefined();
    });

    it('un botón que no es el primario no empieza el deslizamiento', async () => {
        const { wrapper } = await mountPicker();
        const grab = wrapper.get('[data-grab]');
        const event = new PointerEvent('pointerdown', { pointerId: 1, isPrimary: true, button: 2, clientY: 100, bubbles: true });

        grab.element.dispatchEvent(event);
        await nextTick();

        expect(wrapper.get('dialog').attributes('data-dragging')).toBeUndefined();
    });

    it('con foto, va de borde a borde arriba y el contenido —nombre, precio— después; sin foto, el ícono con aire para «Cerrar»', async () => {
        const photo = { src: '/storage/media/dishes/0123456789abcdef0123-480.webp', srcset: '/storage/media/dishes/0123456789abcdef0123-480.webp 480w' };
        const withPhoto = await mountPicker({ ...SANCOCHO, photo });
        const scroll = withPhoto.wrapper.get('form > div.overflow-y-auto');

        expect(scroll.element.firstElementChild?.matches('[data-zoom]')).toBe(true);
        expect(scroll.classes()).not.toContain('pt-12');
        withPhoto.wrapper.unmount();

        const without = await mountPicker();

        expect(without.wrapper.get('form > div.overflow-y-auto').classes()).toContain('pt-12');
    });

    it('«Agregar · $X» queda fuera de lo que se desplaza, fijo abajo', async () => {
        const { wrapper } = await mountPicker();

        expect(wrapper.get('form > div.overflow-y-auto').find('[data-add]').exists()).toBe(false);
        expect(wrapper.get('form > footer').find('[data-add]').exists()).toBe(true);
    });
});
