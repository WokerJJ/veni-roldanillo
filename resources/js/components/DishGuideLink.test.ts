import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

async function mountGuide(locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: DishGuideLink } = await import('./DishGuideLink.vue');

    return mount(DishGuideLink, { attrs: { class: 'extra' }, attachTo: document.body });
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

afterEach(() => {
    document.body.replaceChildren();
});

describe('DishGuideLink', () => {
    it('es el enlace de siempre del pie y de la bienvenida del celular, con 44 px y la clase de quien lo usa', async () => {
        const wrapper = await mountGuide();
        const guide = wrapper.get('a[data-dish-guide-link]');

        expect(guide.attributes('href')).toBe('/dishes');
        expect(guide.text()).toBe('Guía de platos típicos');
        expect(guide.classes()).toEqual(expect.arrayContaining(['extra', 'min-h-touch']));
    });

    it('en inglés', async () => {
        const wrapper = await mountGuide('en');

        expect(wrapper.get('[data-dish-guide-link]').text()).toBe('Typical dishes guide');
    });
});
