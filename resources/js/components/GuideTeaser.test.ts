import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

async function mountTeaser(locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: GuideTeaser } = await import('./GuideTeaser.vue');

    return mount(GuideTeaser, { attrs: { class: 'w-full' } });
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

describe('GuideTeaser', () => {
    it('es un enlace a la guía con tres fotos decorativas, su título y una frase', async () => {
        const wrapper = await mountTeaser();
        const card = wrapper.get('a[data-guide-teaser]');

        expect(card.attributes('href')).toBe('/dishes');
        expect(card.classes()).toContain('w-full');
        expect(card.text()).toContain('Guía de platos típicos');
        expect(card.text()).toContain('Qué se come en el Valle y dónde lo sirven hoy');

        const photos = card.get('span[aria-hidden="true"]').findAll('img');
        expect(photos).toHaveLength(3);
        expect(photos.every((photo) => photo.attributes('alt') === '' && photo.attributes('loading') === 'eager')).toBe(true);
        expect(new Set(photos.map((photo) => photo.attributes('src'))).size).toBe(3);
        // El ícono de la flecha es decorativo.
        expect(card.get('svg').attributes('aria-hidden')).toBe('true');
    });

    it('en inglés', async () => {
        const wrapper = await mountTeaser('en');

        expect(wrapper.text()).toContain('Typical dishes guide');
        expect(wrapper.text()).toContain('where it is served today');
    });
});
