import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrderItem } from '@/order/selection';
import { resetOrders, useOrder } from '@/order/useOrder';
import type * as FakeInertia from '@/testing/inertia';

import es from '../../../lang/es.json';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

// Sin conexión (o con un despliegue nuevo) el chunk del carrito no baja.
vi.mock('./OrderCart.vue', () => {
    throw new Error('Failed to fetch dynamically imported module');
});

const RESTAURANT = {
    slug: 'prueba-la-ceiba',
    name: 'La Ceiba (prueba)',
    whatsapp: '570000722116',
    delivery: { available: true, notes: null, zones: [] },
    payment_methods: ['cash' as const],
};

const JUICE: OrderItem = { dish: 'Jugo de prueba', unitPrice: 4000, quantity: 1, choices: [], removed: [], note: null };

enableAutoUnmount(afterEach);

afterEach(() => {
    resetOrders();
});

describe('OrderBar sin el carrito', () => {
    it('si el carrito no baja, lo dice y el foco se queda en la barra', async () => {
        const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
        inertia.reset();
        inertia.receiveFromServer('es', { replace: true });
        useOrder(RESTAURANT.slug).add(JUICE);

        const { default: OrderBar } = await import('./OrderBar.vue');
        const wrapper = mount(OrderBar, { props: { restaurant: RESTAURANT }, attachTo: document.body });
        const button = wrapper.get<HTMLButtonElement>('[data-open-cart]');
        button.element.focus();

        await button.trigger('click');
        await vi.waitFor(() => {
            expect(wrapper.get('[data-bar-announcement]').text()).toBe(es['order.cart.load_error']);
        });
        expect(wrapper.find('[data-order-cart]').exists()).toBe(false);
        expect(document.activeElement).toBe(button.element);
    });
});
