import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

async function mountHeader(title = 'La Ceiba (prueba)') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer('es', { replace: true });
    const main = document.createElement('main');
    main.id = 'contenido';
    main.innerHTML = `<h1> ${title} </h1>`;
    document.body.append(main);

    const { default: CompactHeader } = await import('./CompactHeader.vue');

    return mount(CompactHeader, { attachTo: document.body });
}

async function scrollTo(y: number) {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    await flushPromises();
}

enableAutoUnmount(afterEach);

afterEach(() => {
    document.body.replaceChildren();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
});

const css = readFileSync(join(__dirname, 'CompactHeader.vue'), 'utf8').split('<style scoped>')[1] ?? '';

describe('CompactHeader (#139, ADR 0041)', () => {
    it('arriba no se ve ni recibe el foco: la cabecera del layout está a la vista', async () => {
        const wrapper = await mountHeader();
        const header = wrapper.get('[data-compact-header]');

        expect(header.attributes('data-shown')).toBeUndefined();
        expect((header.element as HTMLElement).inert).toBe(true);
    });

    it('al desplazar aparece con «‹ Volver» al mapa y el nombre de la página, que el lector ya oyó en el título', async () => {
        const wrapper = await mountHeader();
        await scrollTo(200);
        const header = wrapper.get('[data-compact-header]');

        expect(header.attributes('data-shown')).toBe('true');
        expect((header.element as HTMLElement).inert).toBe(false);
        const back = header.get('a');
        expect(back.attributes('href')).toBe('/');
        expect(back.attributes('aria-label')).toBe('Volver al mapa');
        expect(back.text()).toBe('Volver');
        const title = header.get('p');
        expect(title.text()).toBe('La Ceiba (prueba)');
        expect(title.attributes('aria-hidden')).toBe('true');

        await scrollTo(0);
        expect(header.attributes('data-shown')).toBeUndefined();
    });

    it('solo por debajo de 1024 px, se desliza solo sin «Reducir movimiento» y lo enfocado no queda debajo', () => {
        expect(css).toMatch(/@media \(min-width: 64rem\) \{\s*\.compact-header \{\s*display: none;/);
        expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.compact-header \{[^}]*transition-property: translate, visibility;/);
        expect(css).toMatch(/@media \(width < 64rem\) \{\s*:global\(html\) \{\s*scroll-padding-top:/);
        expect(css).toContain('min-height: var(--veni-touch-min);');
    });
});
