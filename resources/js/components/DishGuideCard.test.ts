import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

async function mountGuide(props: { link?: boolean } = {}, locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: DishGuideCard } = await import('./DishGuideCard.vue');

    return mount(DishGuideCard, { props, attrs: { class: 'extra' }, attachTo: document.body });
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

afterEach(() => {
    document.body.replaceChildren();
});

describe('DishGuideCard', () => {
    it('es una tarjeta compacta de una línea, con su ícono y la clase de quien la usa', async () => {
        const wrapper = await mountGuide();
        const card = wrapper.get('a[data-dish-guide-card]');

        expect(card.attributes('href')).toBe('/dishes');
        expect(card.classes()).toContain('min-h-touch');
        expect(wrapper.classes()).toContain('extra');
        expect(card.findAll('[data-icon]').map((icon) => icon.attributes('data-icon'))).toEqual(['empanada', 'chevron-derecha']);
    });

    it('su nombre es el de la guía; la explicación es su descripción, fuera del nombre (aria-describedby)', async () => {
        const wrapper = await mountGuide();
        const card = wrapper.get('a[data-dish-guide-card]');

        expect(card.text()).toBe('Guía de platos típicos');
        const description = document.getElementById(card.attributes('aria-describedby') ?? '');
        expect(description?.textContent.trim()).toBe('Conocé los platos y las bebidas típicas del Valle, y buscá dónde pedirlos.');
        expect(card.element.contains(description)).toBe(false);
    });

    it('con `link`, el enlace de siempre del pie y de la bienvenida', async () => {
        const wrapper = await mountGuide({ link: true });
        const guide = wrapper.get('a[data-dish-guide-link]');

        expect(guide.attributes('href')).toBe('/dishes');
        expect(guide.text()).toBe('Guía de platos típicos');
        expect(guide.classes()).toEqual(expect.arrayContaining(['extra', 'min-h-touch']));
        expect(wrapper.find('[data-dish-guide-card]').exists()).toBe(false);
    });

    it('en inglés', async () => {
        const wrapper = await mountGuide({ link: true }, 'en');

        expect(wrapper.get('[data-dish-guide-link]').text()).toBe('Typical dishes guide');
    });
});
