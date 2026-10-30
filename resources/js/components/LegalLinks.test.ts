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

    it('en la bienvenida, solo los datos personales y los términos', async () => {
        const links = (await mountLinks({ short: true })).findAll('a');

        expect(links.map((link) => link.attributes('href'))).toEqual(['/privacy', '/terms']);
    });

    it('en inglés', async () => {
        const wrapper = await mountLinks({}, 'en');

        expect(wrapper.get('nav').attributes('aria-label')).toBe('Legal documents');
        expect(wrapper.get('[data-legal-link="terms"]').text()).toBe('Terms of use');
    });
});
