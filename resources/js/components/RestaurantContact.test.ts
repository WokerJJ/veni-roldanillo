import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaymentMethod, RestaurantProfile } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

type Contact = Pick<RestaurantProfile, 'address' | 'reference' | 'phone' | 'whatsapp' | 'payment_methods' | 'price_level'>;

const COMPLETE: Contact = {
    address: 'Calle de Prueba # 1-23',
    reference: 'Dirección inventada',
    phone: '602 000 0000',
    whatsapp: '570009998877',
    payment_methods: ['cash', 'nequi', 'daviplata', 'card'],
    price_level: 2,
};

const NOTHING: Contact = { address: null, reference: null, phone: null, whatsapp: null, payment_methods: [], price_level: null };

async function mountContact(restaurant: Contact = COMPLETE, locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: RestaurantContact } = await import('./RestaurantContact.vue');
    const wrapper = mount(RestaurantContact, { props: { restaurant } });

    return {
        wrapper,
        /** Los rótulos de los datos que se ven, en orden. */
        labels: () => wrapper.findAll('dt').map((label) => label.text()),
    };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

describe('RestaurantContact', () => {
    it.each([
        ['es', 'Ubicación y contacto', ['Dirección', 'Teléfono', 'WhatsApp', 'Medios de pago', 'Nivel de precios']],
        ['en', 'Location and contact', ['Address', 'Phone', 'WhatsApp', 'Payment methods', 'Price level']],
    ] as const)('en %s muestra los datos del negocio, cada uno con su rótulo', async (locale, title, labels) => {
        const { wrapper, labels: shown } = await mountContact(COMPLETE, locale);

        expect(wrapper.get('h2').text()).toBe(title);
        expect(shown()).toEqual(labels);
    });

    it('la dirección va con su referencia', async () => {
        const { wrapper } = await mountContact();

        expect(wrapper.get('[data-address] dd').findAll('span').map((line) => line.text())).toEqual(['Calle de Prueba # 1-23', 'Dirección inventada']);
    });

    describe('teléfono', () => {
        it('es un enlace para llamar, de 44 px, con el número como lo escribió el restaurante', async () => {
            const { wrapper } = await mountContact();
            const link = wrapper.get('[data-phone] a');

            expect(link.text()).toBe('602 000 0000');
            expect(link.attributes('href')).toBe('tel:+576020000000');
            expect(link.classes()).toContain('min-h-touch');
        });

        it.each([
            ['6020000000', 'tel:+576020000000'],
            ['(602) 000-0000', 'tel:+576020000000'],
            ['+57 602 000 0000', 'tel:+576020000000'],
            // Lo que no son los diez dígitos de un número nacional se marca tal cual.
            ['123', 'tel:123'],
        ])('«%s» se marca como %s', async (phone, href) => {
            const { wrapper } = await mountContact({ ...COMPLETE, phone });

            expect(wrapper.get('[data-phone] a').attributes('href')).toBe(href);
        });
    });

    describe('WhatsApp', () => {
        it('es un enlace para escribirle al restaurante, sin mensaje armado, que abre aparte', async () => {
            const { wrapper } = await mountContact();
            const link = wrapper.get('[data-whatsapp] a');

            expect(link.attributes('href')).toBe('https://wa.me/570009998877');
            expect(link.attributes('target')).toBe('_blank');
            // La página que se abre no recibe de dónde viene ni puede tocar esta.
            expect(link.attributes('rel')).toBe('noopener noreferrer');
            expect(link.text()).toBe('+57 000 999 8877');
            expect(link.classes()).toContain('min-h-touch');
        });

        it('un número con otra forma se muestra tal cual', async () => {
            const { wrapper } = await mountContact({ ...COMPLETE, whatsapp: '5712345' });

            expect(wrapper.get('[data-whatsapp] a').text()).toBe('5712345');
        });
    });

    describe('medios de pago', () => {
        it.each([
            ['es', ['Efectivo', 'Nequi', 'Daviplata', 'Tarjeta']],
            ['en', ['Cash', 'Nequi', 'Daviplata', 'Card']],
        ] as const)('en %s son una lista con nombre', async (locale, methods) => {
            const { wrapper } = await mountContact(COMPLETE, locale);
            const list = wrapper.get('[data-payments] ul');

            expect(list.findAll('li').map((item) => item.text())).toEqual(methods);
            expect(list.attributes('aria-labelledby')).toBe(wrapper.get('[data-payments] dt').attributes('id'));
        });

        it('uno que esta versión de la app no conoce no sale como una clave suelta', async () => {
            const { wrapper } = await mountContact({ ...COMPLETE, payment_methods: ['cash', 'transferencia' as PaymentMethod] });

            expect(wrapper.findAll('[data-payments] li').map((item) => item.text())).toEqual(['Efectivo']);
        });
    });

    it.each([
        ['es', '2 de 4'],
        ['en', '2 out of 4'],
    ] as const)('en %s dice el nivel de precios con palabras', async (locale, text) => {
        const { wrapper } = await mountContact(COMPLETE, locale);

        expect(wrapper.get('[data-price-level] dd').text()).toBe(text);
    });

    describe('lo que el restaurante no cargó', () => {
        it('no deja ni el rótulo', async () => {
            const { labels } = await mountContact({ ...NOTHING, address: 'Calle de Prueba # 1-23', payment_methods: ['cash'] });

            expect(labels()).toEqual(['Dirección', 'Medios de pago']);
        });

        it('con solo la referencia, la dirección sale igual', async () => {
            const { wrapper } = await mountContact({ ...NOTHING, reference: 'Frente al parque de prueba' });

            expect(wrapper.get('[data-address] dd').text()).toBe('Frente al parque de prueba');
        });

        it('sin ningún dato, la sección no sale', async () => {
            const { wrapper } = await mountContact(NOTHING);

            expect(wrapper.find('section').exists()).toBe(false);
            expect(wrapper.find('h2').exists()).toBe(false);
        });
    });

    it('es una sección con título de segundo nivel', async () => {
        const { wrapper } = await mountContact();

        expect(wrapper.get('section').attributes('aria-labelledby')).toBe(wrapper.get('h2').attributes('id'));
    });
});
