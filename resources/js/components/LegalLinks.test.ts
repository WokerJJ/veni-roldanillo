import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

async function mountLinks(props: { short?: boolean } = {}, locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: LegalLinks } = await import('./LegalLinks.vue');

    return mount(LegalLinks, { props });
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

describe('LegalLinks', () => {
    it('enlaza los tres documentos, en una navegación con nombre', async () => {
        const nav = (await mountLinks()).get('nav');

        expect(nav.attributes('aria-label')).toBe('Documentos legales');
        expect(nav.findAll('a').map((link) => link.text())).toEqual([
            'Tratamiento de datos personales',
            'Términos de uso',
            'Política de reseñas',
        ]);
    });

    it('enlaza a las rutas de los documentos en el servidor (#23)', async () => {
        const links = (await mountLinks()).findAll('nav a');

        // Las de routes/web.php: legal.privacy, legal.terms y legal.reviews.
        expect(links.map((link) => link.attributes('href'))).toEqual(['/privacy', '/terms', '/reviews-policy']);
    });

    it('en la bienvenida, solo los datos personales y los términos', async () => {
        const links = (await mountLinks({ short: true })).findAll('nav a');

        expect(links.map((link) => link.attributes('href'))).toEqual(['/privacy', '/terms']);
    });

    it('antes de la navegación, la guía de platos típicos: baja con este chunk, no con el arranque (#21)', async () => {
        for (const short of [false, true]) {
            const wrapper = await mountLinks({ short });
            const guide = wrapper.get('[data-dish-guide-link]');

            expect(guide.attributes('href')).toBe('/dishes');
            expect(guide.text()).toBe('Guía de platos típicos');
            expect(guide.element.closest('nav')).toBeNull();
            wrapper.unmount();
        }
    });

    it('la clase que le pongan va a los dos: el enlace de la guía y la navegación', async () => {
        const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
        inertia.reset();
        inertia.receiveFromServer('es', { replace: true });
        const { default: LegalLinks } = await import('./LegalLinks.vue');

        const wrapper = mount(LegalLinks, { props: { short: true }, attrs: { class: 'text-sm' } });

        expect(wrapper.get('[data-dish-guide-link]').classes()).toContain('text-sm');
        expect(wrapper.get('nav').classes()).toContain('text-sm');
    });

    it('los demás atributos no se repiten en los dos: un id queda, como mucho, en uno', async () => {
        const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
        inertia.reset();
        inertia.receiveFromServer('es', { replace: true });
        const { default: LegalLinks } = await import('./LegalLinks.vue');

        const wrapper = mount(LegalLinks, { attrs: { id: 'x', class: 'text-sm' } });

        expect(wrapper.findAll('#x').length).toBeLessThanOrEqual(1);
        expect(wrapper.get('nav').classes()).toContain('text-sm');
    });

    it('en inglés', async () => {
        const wrapper = await mountLinks({}, 'en');

        expect(wrapper.get('nav').attributes('aria-label')).toBe('Legal documents');
        expect(wrapper.get('[data-legal-link="terms"]').text()).toBe('Terms of use');
        expect(wrapper.get('[data-dish-guide-link]').text()).toBe('Typical dishes guide');
    });
});
