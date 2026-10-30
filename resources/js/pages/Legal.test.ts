import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LegalDocument } from './Legal.vue';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/** Un documento corto, con la forma que manda LegalDocumentController. */
const DOCUMENT: LegalDocument = {
    key: 'privacy',
    title: 'Tratamiento de datos personales',
    intro: 'Pedimos lo mínimo.',
    version: '0.1',
    effective_date: '2026-10-29',
    effective_date_label: '29 de octubre de 2026',
    sections: [
        { id: 'controller', heading: 'Quién responde por tus datos', blocks: [{ kind: 'paragraph', text: 'El responsable es Vení Roldanillo.' }] },
        {
            id: 'rights',
            heading: 'Tus derechos',
            blocks: [
                { kind: 'paragraph', text: 'Tenés derecho a:' },
                { kind: 'list', items: ['Conocer tus datos.', 'Pedir que se borren.'] },
            ],
        },
    ],
};

const RELATED = [
    { key: 'terms' as const, href: '/terms' },
    { key: 'reviews' as const, href: '/reviews-policy' },
];

async function mountLegal({ draft = true, locale = 'es' }: { draft?: boolean; locale?: 'es' | 'en' } = {}) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: Legal } = await import('./Legal.vue');

    return mount(Legal, { props: { document: DOCUMENT, draft, contactEmail: 'privacidad@example.test', related: RELATED } });
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

describe('Documento legal', () => {
    it('lleva el título del documento como h1 y en el título de la pestaña', async () => {
        const wrapper = await mountLegal();

        expect(wrapper.get('h1').text()).toBe('Tratamiento de datos personales');
        expect(wrapper.get('inertia-head').attributes('title')).toBe('Tratamiento de datos personales');
        expect(wrapper.get('article').attributes('data-legal')).toBe('privacy');
    });

    it('muestra la versión y desde cuándo rige', async () => {
        const wrapper = await mountLegal();

        expect(wrapper.get('[data-version]').text()).toBe('Versión 0.1 · vigente desde el 29 de octubre de 2026');
    });

    it('avisa que es un borrador sin revisión jurídica, y lo quita cuando la config lo apaga', async () => {
        const draft = (await mountLegal()).get('[data-draft]');

        expect(draft.attributes('role')).toBe('note');
        expect(draft.text()).toContain('Borrador pendiente de revisión jurídica');
        expect(draft.text()).toContain('No es asesoría legal');

        expect((await mountLegal({ draft: false })).find('[data-draft]').exists()).toBe(false);
    });

    it('la tabla de contenido enlaza cada sección por su ancla, y cada sección tiene su h2', async () => {
        const wrapper = await mountLegal();
        const links = wrapper.findAll('[data-toc] a');
        const sections = wrapper.findAll('[data-section]');

        expect(links.map((link) => link.attributes('href'))).toEqual(['#privacy-controller', '#privacy-rights']);
        expect(sections.map((section) => section.attributes('id'))).toEqual(['privacy-controller', 'privacy-rights']);
        expect(sections[1]?.get('h2').text()).toBe('Tus derechos');
        expect(sections[1]?.attributes('aria-labelledby')).toBe(sections[1]?.get('h2').attributes('id'));
    });

    it('arma párrafos y listas con viñetas', async () => {
        const rights = (await mountLegal()).findAll('[data-section]')[1];

        expect(rights?.get('p').text()).toBe('Tenés derecho a:');
        expect(rights?.findAll('ul li').map((item) => item.text())).toEqual(['Conocer tus datos.', 'Pedir que se borren.']);
    });

    it('da el correo de contacto como enlace y enlaza los otros documentos y los créditos', async () => {
        const wrapper = await mountLegal();

        expect(wrapper.get('[data-contact] a').attributes('href')).toBe('mailto:privacidad@example.test');

        const related = wrapper.findAll('[data-related] a');
        expect(related.map((link) => link.attributes('href'))).toEqual(['/terms', '/reviews-policy', '/credits']);
        expect(related.map((link) => link.text())).toEqual(['Términos de uso', 'Política de reseñas', 'Créditos y datos de OpenStreetMap']);
    });

    it('en inglés, los textos de la página también', async () => {
        const wrapper = await mountLegal({ locale: 'en' });

        expect(wrapper.get('[data-draft]').text()).toContain('Draft pending legal review');
        expect(wrapper.get('[data-toc] h2').text()).toBe('On this page');
    });
});
