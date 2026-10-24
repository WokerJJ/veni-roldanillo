import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrderItem } from '@/order/selection';
import { resetOrders, useOrder } from '@/order/useOrder';
import type { RestaurantProfile } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

const RESTAURANT: Pick<RestaurantProfile, 'slug' | 'name' | 'whatsapp' | 'delivery' | 'payment_methods'> = {
    slug: 'prueba-la-ceiba',
    name: 'La Ceiba (prueba)',
    whatsapp: '570000722116',
    delivery: { available: true, notes: null, zones: [] },
    payment_methods: ['cash'],
};

const JUICE: OrderItem = { dish: 'Jugo de prueba', unitPrice: 4000, quantity: 1, choices: [], removed: [], note: null };

async function mountBar() {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer('es', { replace: true });

    const { default: OrderBar } = await import('./OrderBar.vue');

    return mount(OrderBar, { props: { restaurant: RESTAURANT }, attachTo: document.body });
}

enableAutoUnmount(afterEach);

afterEach(() => {
    resetOrders();
});

describe('OrderBar', () => {
    it('no aparece mientras el pedido está vacío', async () => {
        const wrapper = await mountBar();

        expect(wrapper.find('[data-order-bar]').exists()).toBe(false);
    });

    it('aparece con el primer plato y dice cuántos y cuánto', async () => {
        const wrapper = await mountBar();

        useOrder(RESTAURANT.slug).add({ ...JUICE, quantity: 2 });
        await flushPromises();

        const button = wrapper.get('[data-open-cart]');
        expect(button.attributes('aria-haspopup')).toBe('dialog');
        expect(button.text().replace(/\p{Zs}/gu, ' ')).toBe('Ver tu pedido 2 platos · $ 8.000');
    });

    it('abre el carrito al tocarla y devuelve el foco al cerrar', async () => {
        useOrder(RESTAURANT.slug).add(JUICE);
        const wrapper = await mountBar();
        const button = wrapper.get('[data-open-cart]');

        await button.trigger('click');
        // El carrito baja aparte, con import(): tarda más que una vuelta de promesas.
        await vi.waitFor(() => {
            expect(wrapper.find('[data-order-cart]').exists()).toBe(true);
        });

        await wrapper.get('[data-order-cart] [data-close]').trigger('click');
        await flushPromises();
        expect(wrapper.find('[data-order-cart]').exists()).toBe(false);
        expect(document.activeElement).toBe(button.element);
    });

    it('trae el pedido guardado en el dispositivo al volver a la ficha', async () => {
        window.localStorage.setItem('veni:cart:prueba-la-ceiba', JSON.stringify({ v: 1, savedAt: Date.now(), data: [JUICE] }));

        const wrapper = await mountBar();

        expect(wrapper.get('[data-bar-summary]').text()).toContain('1 plato');
    });

    it('mientras está, deja lugar abajo para que no tape lo enfocado (WCAG 2.4.11)', async () => {
        const html = document.documentElement;
        const wrapper = await mountBar();
        expect(html.classList.contains('has-order-bar')).toBe(false);

        useOrder(RESTAURANT.slug).add(JUICE);
        await flushPromises();
        expect(html.classList.contains('has-order-bar')).toBe(true);

        useOrder(RESTAURANT.slug).clear();
        await flushPromises();
        expect(html.classList.contains('has-order-bar')).toBe(false);

        useOrder(RESTAURANT.slug).add(JUICE);
        await flushPromises();
        wrapper.unmount();
        expect(html.classList.contains('has-order-bar')).toBe(false);
    });
});
