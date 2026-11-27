import { mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';

import { resetOrders, useOrder } from '@/order/useOrder';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));
// El chunk del selector no baja: sin señal, o con un despliegue nuevo.
vi.mock('@/components/DishPicker.vue', () => {
    throw new Error('sin red');
});

it('si el selector no baja al tocar «Cambiar», lo anuncia', async () => {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer('es', { replace: true });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    resetOrders();

    const dish = {
        name: 'Jugo de prueba',
        description: null,
        price: 4000,
        sold_out_until: null,
        ingredients: [],
        groups: [{ name: 'Adiciones', kind: 'choice' as const, min: 0, max: 1, options: [{ name: 'Leche', price: 1000, ingredient: null }] }],
        photo: null,
    };
    useOrder('prueba').add({ dish: dish.name, unitPrice: 4000, quantity: 1, choices: [], removed: [], note: null });

    const { default: OrderCart } = await import('./OrderCart.vue');
    const wrapper = mount(OrderCart, {
        props: {
            restaurant: {
                slug: 'prueba',
                name: 'Prueba',
                whatsapp: '570000722116',
                delivery: { available: true, notes: null, zones: [] },
                payment_methods: ['cash'],
                menu: [{ name: 'Bebidas', dishes: [dish] }],
            },
        },
        attachTo: document.body,
    });

    await wrapper.get('[data-change]').trigger('click');

    await vi.waitFor(() => {
        expect(wrapper.get('[data-announcement]').text()).toBe('No se pudo abrir el plato. Revisá la conexión e intentá de nuevo.');
    });
});
