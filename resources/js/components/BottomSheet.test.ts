import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick, ref } from 'vue';

import type { SheetSnap } from '@/components/sheet';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/**
 * El panel con `v-model:snap` como lo usa el inicio, dentro de un mapa de
 * 390 × 760 px (happy-dom no calcula el diseño: se lo damos medido).
 */
async function mountSheet({ snap = 'peek', docked = false }: { snap?: SheetSnap; docked?: boolean } = {}) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer('es', { replace: true });

    const { default: BottomSheet } = await import('./BottomSheet.vue');
    const model = ref<SheetSnap>(snap);
    const wrapper = mount(() =>
        h(BottomSheet, { snap: model.value, 'onUpdate:snap': (next: SheetSnap) => (model.value = next), docked }, () => h('p', 'Contenido')),
    );
    const section = wrapper.get('section');

    // El mapa ocupa de 60 a 820 px; el panel termina a 36 px del fondo (la atribución).
    const map = document.createElement('div');
    vi.spyOn(map, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 60, 390, 760));
    Object.defineProperty(map, 'clientHeight', { value: 760 });
    Object.defineProperty(section.element, 'offsetParent', { value: map });
    let height = 120;
    vi.spyOn(section.element, 'getBoundingClientRect').mockImplementation(() => new DOMRect(8, 784 - height, 374, height));

    const handle = () => wrapper.get('[data-sheet-handle]');

    return {
        wrapper,
        model,
        section,
        handle,
        setHeight: (next: number) => (height = next),
        announced: () => wrapper.get('[role="status"]').text(),
        drag: async (from: number, to: number, { slow = false } = {}) => {
            // Rápido: a 1 px/ms; despacio, quieto medio segundo antes de soltar.
            await pointer(handle(), 'pointerdown', from, 0);
            await pointer(handle(), 'pointermove', (from + to) / 2, Math.abs(to - from) / 2);
            await pointer(handle(), 'pointermove', to, Math.abs(to - from));
            await pointer(handle(), 'pointerup', to, Math.abs(to - from) + (slow ? 500 : 10));
            await handle().trigger('click');
        },
    };
}

/** Un evento de puntero con su hora (happy-dom no deja pasarla al crearlo). */
async function pointer(target: { element: Element }, type: string, clientY: number, time: number): Promise<void> {
    const event = new PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, clientY, bubbles: true });
    Object.defineProperty(event, 'timeStamp', { value: time });
    target.element.dispatchEvent(event);
    await nextTick();
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    // La captura del puntero, sin efecto: aquí no hay un dedo que se salga de la manija.
    Object.assign(Element.prototype, { setPointerCapture: () => undefined });
});

describe('BottomSheet', () => {
    it('lleva su alto en --sheet-height y la altura en la que está', async () => {
        const { section } = await mountSheet({ snap: 'half' });

        expect(section.attributes('style')).toContain('--sheet-height: 50%');
        expect(section.attributes('data-sheet')).toBe('half');
    });

    it('la manija es un botón con nombre, que dice en qué altura está y solo se ve en el celular', async () => {
        const { handle } = await mountSheet();

        expect(handle().element.tagName).toBe('BUTTON');
        expect(handle().attributes('aria-label')).toBe('Cambiar el alto del panel (ahora asomado)');
        expect(handle().classes()).toEqual(expect.arrayContaining(['md:hidden', 'touch-none', 'h-11', 'w-24']));
    });

    it('tocarla sube un escalón y, desde el completo, vuelve a asomado; cada cambio se anuncia', async () => {
        const { handle, model, announced } = await mountSheet();

        await handle().trigger('click');
        expect(model.value).toBe('half');
        expect(announced()).toBe('Panel a media altura');

        await handle().trigger('click');
        expect(model.value).toBe('full');

        await handle().trigger('click');
        expect(model.value).toBe('peek');
        expect(announced()).toBe('Panel asomado');
    });

    it.each([
        ['ArrowUp', 'half', 'full'],
        ['ArrowDown', 'half', 'peek'],
        ['ArrowDown', 'peek', 'peek'],
        ['Home', 'full', 'peek'],
        ['End', 'peek', 'full'],
    ] as const)('con el teclado, %s desde %s lo deja en %s', async (key, from, to) => {
        const { handle, model } = await mountSheet({ snap: from });
        const event = new KeyboardEvent('keydown', { key, cancelable: true });

        handle().element.dispatchEvent(event);

        expect(model.value).toBe(to);
        // Las flechas no desplazan lo de adentro.
        expect(event.defaultPrevented).toBe(true);
    });

    it('arrastrada, sigue al dedo sin animar y, al soltarla despacio, queda en la altura más cercana', async () => {
        const { handle, section, model } = await mountSheet();

        await pointer(handle(), 'pointerdown', 700, 0);
        await pointer(handle(), 'pointermove', 500, 600);

        expect(section.attributes('style')).toContain('--sheet-height: 320px');
        expect(section.classes()).not.toContain('max-md:motion-safe:transition-[height]');

        await pointer(handle(), 'pointerup', 500, 900);
        // El clic que sigue al arrastre no sube otro escalón.
        await handle().trigger('click');

        expect(model.value).toBe('half');
        expect(section.attributes('style')).toContain('--sheet-height: 50%');
        expect(section.classes()).toContain('max-md:motion-safe:transition-[height]');
    });

    it('un gesto rápido hacia arriba lo lleva a la altura siguiente aunque no llegue a la mitad', async () => {
        const { model, drag } = await mountSheet();

        // 100 px: más cerca de asomado que de media altura.
        await drag(700, 600);

        expect(model.value).toBe('half');
    });

    it('arrastrada hacia abajo hasta el fondo, queda asomado y no baja de ahí', async () => {
        const { model, drag, setHeight, section } = await mountSheet({ snap: 'full' });
        setHeight(716);

        await drag(100, 900, { slow: true });

        expect(model.value).toBe('peek');
        expect(section.attributes('style')).toContain('--sheet-height: 7.5rem');
    });

    it('un toque sin moverse no es un arrastre: sube un escalón, como el clic', async () => {
        const { handle, model } = await mountSheet();

        await pointer(handle(), 'pointerdown', 700, 0);
        await pointer(handle(), 'pointermove', 703, 50);
        await pointer(handle(), 'pointerup', 703, 80);
        await handle().trigger('click');

        expect(model.value).toBe('half');
    });

    it('sin mapa no flota: ni manija, ni alturas, ni anuncios', async () => {
        const { wrapper, section } = await mountSheet({ docked: true });

        expect(wrapper.find('[data-sheet-handle]').exists()).toBe(false);
        expect(wrapper.find('[role="status"]').exists()).toBe(false);
        expect(section.attributes('style')).toBeUndefined();
        expect(wrapper.text()).toBe('Contenido');
    });
});
