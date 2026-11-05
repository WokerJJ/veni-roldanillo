import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

async function mountLinks(props: { short?: boolean; inline?: boolean } = {}, locale: 'es' | 'en' = 'es') {
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

    it('la clase y los demás atributos que le pongan van a la navegación', async () => {
        const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
        inertia.reset();
        inertia.receiveFromServer('es', { replace: true });
        const { default: LegalLinks } = await import('./LegalLinks.vue');

        const wrapper = mount(LegalLinks, { props: { short: true }, attrs: { id: 'x', class: 'text-sm' } });

        expect(wrapper.get('nav').classes()).toContain('text-sm');
        expect(wrapper.get('nav').attributes('id')).toBe('x');
    });

    it('solo trae lo legal: la guía de platos y la navegación de la cabecera son otros componentes (DishGuideCard, MainNav)', async () => {
        const wrapper = await mountLinks();

        expect(wrapper.find('[data-dish-guide-link]').exists()).toBe(false);
        expect(wrapper.find('[data-main-nav]').exists()).toBe(false);
        expect(wrapper.findAll('a').every((link) => link.element.closest('nav[data-legal-links]') !== null)).toBe(true);
    });

    it('con `inline` (la línea chica de la barra lateral, ADR 0037): solo los dos documentos, con rótulos cortos, separados por «·» que el lector no lee', async () => {
        const wrapper = await mountLinks({ short: true, inline: true });
        const nav = wrapper.get('nav[data-legal-links]');

        // El nombre accesible es el completo y contiene el rótulo que se ve (WCAG 2.5.3).
        expect(nav.findAll('a').map((link) => [link.text(), link.attributes('aria-label'), link.attributes('href')])).toEqual([
            ['Datos personales', 'Tratamiento de datos personales', '/privacy'],
            ['Términos', 'Términos de uso', '/terms'],
        ]);
        expect(nav.findAll('[aria-hidden="true"]').map((dot) => dot.text())).toEqual(['·', '·']);
        expect(nav.findAll('a').every((link) => link.classes().includes('min-h-touch'))).toBe(true);
    });

    it('en inglés', async () => {
        const wrapper = await mountLinks({}, 'en');

        expect(wrapper.get('nav').attributes('aria-label')).toBe('Legal documents');
        expect(wrapper.get('[data-legal-link="terms"]').text()).toBe('Terms of use');
    });
});
