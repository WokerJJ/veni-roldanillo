import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RestaurantProfile } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

type Delivery = RestaurantProfile['delivery'];

const WITH_ZONES: Delivery = {
    available: true,
    notes: 'Domicilios hasta las 9 de la noche.',
    zones: [
        { neighborhood: 'Barrio El Mirador de Prueba (ficticio)', fee: 2500 },
        { neighborhood: 'Barrio Los Guayacanes (ficticio)', fee: 3000 },
    ],
};

async function mountDelivery(delivery: Delivery = WITH_ZONES, locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: RestaurantDelivery } = await import('./RestaurantDelivery.vue');
    const wrapper = mount(RestaurantDelivery, { props: { delivery } });

    return {
        wrapper,
        // El espacio que no parte la línea de «$ 2.500» se compara como uno común.
        zones: () => wrapper.findAll('[data-zone]').map((zone) => zone.findAll('span').map((part) => part.text().replaceAll(' ', ' '))),
    };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

describe('RestaurantDelivery', () => {
    it.each([
        ['es', 'Domicilios', 'Barrios y costo del domicilio', ['$ 2.500', '$ 3.000']],
        ['en', 'Delivery', 'Neighborhoods and delivery fee', ['COP 2,500', 'COP 3,000']],
    ] as const)('en %s lista los barrios a los que lleva, cada uno con su costo en pesos', async (locale, title, zonesTitle, fees) => {
        const { wrapper, zones } = await mountDelivery(WITH_ZONES, locale);

        expect(wrapper.get('h2').text()).toBe(title);
        expect(wrapper.get('h3').text()).toBe(zonesTitle);
        expect(zones()).toEqual([
            ['Barrio El Mirador de Prueba (ficticio)', fees[0]],
            ['Barrio Los Guayacanes (ficticio)', fees[1]],
        ]);
    });

    it('muestra lo que el restaurante aclara de sus domicilios, y sin nota no deja el hueco', async () => {
        const noted = await mountDelivery();
        expect(noted.wrapper.get('[data-notes]').text()).toBe('Domicilios hasta las 9 de la noche.');
        noted.wrapper.unmount();

        const bare = await mountDelivery({ ...WITH_ZONES, notes: null });
        expect(bare.wrapper.find('[data-notes]').exists()).toBe(false);
    });

    it.each([
        ['es', 'Hace domicilios. Preguntá el costo al pedir.'],
        ['en', 'This restaurant delivers. Ask for the fee when you order.'],
    ] as const)('en %s, sin zonas cargadas dice que el costo se pregunta, sin una lista vacía', async (locale, text) => {
        const { wrapper } = await mountDelivery({ available: true, notes: null, zones: [] }, locale);

        expect(wrapper.get('[data-ask]').text()).toBe(text);
        expect(wrapper.find('ul').exists()).toBe(false);
        expect(wrapper.find('h3').exists()).toBe(false);
    });

    it('con zonas no manda a preguntar el costo', async () => {
        const { wrapper } = await mountDelivery();

        expect(wrapper.find('[data-ask]').exists()).toBe(false);
    });

    it('es una sección con título, y la lista de barrios lleva el nombre de su subtítulo', async () => {
        const { wrapper } = await mountDelivery();

        expect(wrapper.get('section').attributes('aria-labelledby')).toBe(wrapper.get('h2').attributes('id'));
        expect(wrapper.get('ul').attributes('aria-labelledby')).toBe(wrapper.get('h3').attributes('id'));
    });
});
