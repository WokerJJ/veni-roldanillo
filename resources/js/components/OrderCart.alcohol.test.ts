import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { forgetSentOrderIntents } from '@/order/intent';
import type { OrderItem } from '@/order/selection';
import { resetOrders, useOrder } from '@/order/useOrder';
import { resetAddressBook } from '@/saved/addresses';
import type { RestaurantProfile } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/*
| El aviso de mayores de 18 en el carrito (ADR 0052): aparece solo si el
| pedido lleva una bebida alcohólica, en los dos idiomas.
*/

type CartRestaurant = Pick<RestaurantProfile, 'slug' | 'name' | 'whatsapp' | 'delivery' | 'payment_methods'>;

const RESTAURANT: CartRestaurant = {
    slug: 'prueba-la-ceiba',
    name: 'La Ceiba (prueba)',
    whatsapp: '570000722116',
    delivery: { available: false, notes: null, zones: [] },
    payment_methods: ['cash'],
};

const SOUP: OrderItem = { dish: 'Sancocho de prueba', unitPrice: 20000, quantity: 1, choices: [], removed: [], note: null };
const BEER: OrderItem = { dish: 'Cerveza de prueba', unitPrice: 4500, quantity: 2, choices: [], removed: [], note: null, alcohol: true };

async function mountCart(items: OrderItem[], locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const order = useOrder(RESTAURANT.slug);
    items.forEach((item) => order.add(item));

    const { default: OrderCart } = await import('./OrderCart.vue');

    return mount(OrderCart, { props: { restaurant: RESTAURANT }, attachTo: document.body });
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    forgetSentOrderIntents();
    vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
    );
});

afterEach(() => {
    resetOrders();
    resetAddressBook();
    window.localStorage.clear();
    vi.unstubAllGlobals();
});

describe('OrderCart con bebidas alcohólicas', () => {
    it('avisa que solo se entregan a mayores de 18 y que pueden pedir el documento', async () => {
        const wrapper = await mountCart([SOUP, BEER]);

        expect(wrapper.get('[data-alcohol-notice]').text()).toBe('Tu pedido tiene bebidas alcohólicas: solo se entregan a mayores de 18 años y el restaurante puede pedirte el documento.');
        expect(wrapper.get('[data-alcohol-notice]').attributes('role')).toBe('note');
    });

    it('el mensaje que va a salir lo dice también', async () => {
        const wrapper = await mountCart([SOUP, BEER]);
        const href = wrapper.get('[data-send]').attributes('href') ?? '';

        expect(new URL(href).searchParams.get('text')).toContain('Incluye bebidas alcohólicas: solo para mayores de 18 años.');
    });

    it('en inglés, en inglés', async () => {
        const wrapper = await mountCart([BEER], 'en');

        expect(wrapper.get('[data-alcohol-notice]').text()).toContain('only handed over to people over 18');
    });

    it('un pedido sin alcohol no muestra el aviso ni lo agrega al mensaje', async () => {
        const wrapper = await mountCart([SOUP]);
        const href = wrapper.get('[data-send]').attributes('href') ?? '';

        expect(wrapper.find('[data-alcohol-notice]').exists()).toBe(false);
        expect(new URL(href).searchParams.get('text')).not.toContain('18');
    });
});
