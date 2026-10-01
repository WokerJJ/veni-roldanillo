import type { VueWrapper } from '@vue/test-utils';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IconName } from '@/icons/icons';

import manifest from '../../icons/colombia/manifest.json';

/**
 * Los íconos ya pedidos se recuerdan en el módulo (compartido entre
 * componentes): cada prueba importa una copia nueva para que «bajo demanda»
 * no dependa de qué prueba corrió antes.
 */
async function freshIcon() {
    const { default: Icon } = await import('./Icon.vue');
    const { loadIcon } = await import('@/icons/icons');

    return { Icon, loadIcon };
}

/** La raíz del componente (VueWrapper la deja sin tipo). */
function svg(wrapper: VueWrapper): Element {
    return wrapper.element as Element;
}

/** Los íconos que no van en el bundle inicial llegan con una importación dinámica. */
async function drawn(wrapper: VueWrapper): Promise<void> {
    await vi.waitFor(() => {
        expect(svg(wrapper).childElementCount).toBeGreaterThan(0);
    });
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

describe('Icon', () => {
    it('pinta el SVG del ícono con los atributos de su raíz y hereda el color', async () => {
        const { Icon } = await freshIcon();
        const wrapper = mount(Icon, { props: { name: 'sol' } });

        expect(svg(wrapper).tagName).toBe('svg');
        expect(wrapper.attributes()).toMatchObject({
            'data-icon': 'sol',
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '1.5',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
        });
        expect(wrapper.findAll('circle')).toHaveLength(1);
        expect(wrapper.findAll('path')).toHaveLength(8);
        // El <svg> del archivo no se anida dentro del del componente.
        expect(wrapper.findAll('svg svg')).toHaveLength(0);
    });

    it('respeta la raíz de los íconos rellenos', async () => {
        const { Icon } = await freshIcon();
        const wrapper = mount(Icon, { props: { name: 'luna' } });

        expect(wrapper.attributes('fill')).toBe('none');
        expect(wrapper.attributes('stroke-width')).toBe('1.5');

        await wrapper.setProps({ name: 'estrella-llena' });
        await drawn(wrapper);

        expect(wrapper.attributes('fill')).toBe('currentColor');
        expect(wrapper.attributes('stroke')).toBe('none');
        expect(wrapper.attributes('stroke-width')).toBeUndefined();
    });

    it('es decorativo por defecto', async () => {
        const { Icon } = await freshIcon();
        const wrapper = mount(Icon, { props: { name: 'sol' } });

        expect(wrapper.attributes('aria-hidden')).toBe('true');
        expect(wrapper.attributes('focusable')).toBe('false');
        expect(wrapper.attributes('role')).toBeUndefined();
        expect(wrapper.attributes('aria-label')).toBeUndefined();
    });

    it('con etiqueta es una imagen con nombre accesible', async () => {
        const { Icon } = await freshIcon();
        const wrapper = mount(Icon, { props: { name: 'sol', label: 'Tema claro' } });

        expect(wrapper.attributes('role')).toBe('img');
        expect(wrapper.attributes('aria-label')).toBe('Tema claro');
        expect(wrapper.attributes('aria-hidden')).toBeUndefined();
        expect(wrapper.attributes('focusable')).toBe('false');
    });

    it('una etiqueta vacía no lo vuelve una imagen sin nombre', async () => {
        const { Icon } = await freshIcon();
        const wrapper = mount(Icon, { props: { name: 'sol', label: '' } });

        expect(wrapper.attributes('role')).toBeUndefined();
        expect(wrapper.attributes('aria-label')).toBeUndefined();
        expect(wrapper.attributes('aria-hidden')).toBe('true');
    });

    it('mide 24 px por defecto y acepta otro tamaño', async () => {
        const { Icon } = await freshIcon();
        const wrapper = mount(Icon, { props: { name: 'sol' } });

        expect(wrapper.attributes('width')).toBe('24');
        expect(wrapper.attributes('height')).toBe('24');

        await wrapper.setProps({ size: 20 });

        expect(wrapper.attributes('width')).toBe('20');
        expect(wrapper.attributes('height')).toBe('20');
    });

    it('acepta clases de Tailwind para el tamaño y el color', async () => {
        const { Icon } = await freshIcon();
        const wrapper = mount(Icon, { props: { name: 'sol' }, attrs: { class: 'size-5 text-veni-mango' } });

        expect(wrapper.classes()).toEqual(['size-5', 'text-veni-mango']);
    });

    it.each(['sol', 'luna', 'idioma'] as const)('«%s» es del layout: se pinta sin esperar', async (name) => {
        const { Icon } = await freshIcon();
        const wrapper = mount(Icon, { props: { name } });

        expect(svg(wrapper).childElementCount).toBeGreaterThan(0);
    });

    it('cambia de ícono al cambiar el nombre', async () => {
        const { Icon } = await freshIcon();
        const wrapper = mount(Icon, { props: { name: 'sol' } });

        await wrapper.setProps({ name: 'luna' });

        expect(wrapper.attributes('data-icon')).toBe('luna');
        expect(wrapper.findAll('circle')).toHaveLength(0);
        expect(wrapper.findAll('path')).toHaveLength(1);
    });

    it('un ícono bajo demanda reserva su espacio y se pinta al llegar', async () => {
        const { Icon } = await freshIcon();
        const wrapper = mount(Icon, { props: { name: 'sancocho', label: 'Sancocho' } });

        // Antes de llegar: vacío, pero con su tamaño y su nombre accesible.
        expect(svg(wrapper).childElementCount).toBe(0);
        expect(wrapper.attributes('width')).toBe('24');
        expect(wrapper.attributes('height')).toBe('24');
        expect(wrapper.attributes('aria-label')).toBe('Sancocho');

        await drawn(wrapper);

        expect(wrapper.attributes('viewBox')).toBe('0 0 24 24');
        expect(wrapper.findAll('path').length).toBeGreaterThan(0);
    });

    it('un ícono que ya se pidió se pinta sin esperar la segunda vez', async () => {
        const { Icon, loadIcon } = await freshIcon();
        await loadIcon('sancocho');

        const wrapper = mount(Icon, { props: { name: 'sancocho' } });

        expect(svg(wrapper).childElementCount).toBeGreaterThan(0);
    });

    it('si el nombre cambia mientras llega un ícono, gana el último', async () => {
        const { Icon, loadIcon } = await freshIcon();
        const wrapper = mount(Icon, { props: { name: 'ajiaco' } });

        await wrapper.setProps({ name: 'luna' });
        await loadIcon('ajiaco');
        await wrapper.vm.$nextTick();

        expect(wrapper.attributes('data-icon')).toBe('luna');
        // La luna es un solo trazo; el ajiaco, varios.
        expect(wrapper.findAll('path')).toHaveLength(1);
    });

    it('cada ícono del manifiesto tiene su SVG con dibujo', async () => {
        const { loadIcon } = await freshIcon();
        const names = Object.keys(manifest.icons) as IconName[];

        expect(names.length).toBeGreaterThan(3);

        for (const name of names) {
            const art = await loadIcon(name);

            expect(art.attributes.viewBox, name).toBe('0 0 24 24');
            expect(art.attributes, name).not.toHaveProperty('width');
            expect(art.attributes, name).not.toHaveProperty('xmlns');
            expect(art.body, name).toMatch(/^<(?:g|path|circle|ellipse|line|rect|polyline|polygon)\b/);
        }
    });

    it('el nombre es un tipo: uno que no está en el manifiesto no compila', async () => {
        const { Icon } = await freshIcon();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        // @ts-expect-error «no-existe» no es un ícono del manifiesto.
        const name: IconName = 'no-existe';
        // @ts-expect-error La prop «name» solo acepta nombres del manifiesto.
        const wrapper = mount(Icon, { props: { name: 'no-existe' } });

        // Si aun así llegara uno (un dato del servidor), no rompe la página: queda vacío.
        await vi.waitFor(() => {
            expect(warn).toHaveBeenCalledExactlyOnceWith(`[icons] No existe el ícono «${name}».`);
        });
        expect(svg(wrapper).childElementCount).toBe(0);
        expect(wrapper.attributes('aria-hidden')).toBe('true');
    });
});
