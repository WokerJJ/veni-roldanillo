import type { VueWrapper } from '@vue/test-utils';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IconArt, IconName } from '@/icons/icons';

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

type Loader = (name: IconName) => Promise<IconArt>;

const DRAWING: IconArt = { attributes: { viewBox: '0 0 24 24' }, body: '<path d="M4 4H20"/>' };

/**
 * El componente con un cargador de mentira y sin íconos en el bundle inicial:
 * así se prueba qué hace cuando un chunk no llega (sin red).
 */
async function iconWithLoader(loadIcon: Loader) {
    vi.doMock('@/icons/icons', () => ({ readyIcon: () => undefined, loadIcon }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { default: Icon } = await import('./Icon.vue');

    return Icon;
}

/** La raíz del componente (VueWrapper la deja sin tipo). */
function svg(wrapper: VueWrapper): Element {
    return wrapper.element as Element;
}

/**
 * Los íconos que no van en el bundle inicial llegan con una importación
 * dinámica, que en frío y con la máquina cargada tarda más que el segundo que
 * espera vi.waitFor.
 */
async function drawn(wrapper: VueWrapper): Promise<void> {
    await vi.waitFor(
        () => {
            expect(svg(wrapper).childElementCount).toBeGreaterThan(0);
        },
        { timeout: 10_000 },
    );
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

afterEach(async () => {
    // Un ícono que quedó en camino llega aquí, no en medio de la prueba siguiente.
    await vi.dynamicImportSettled();
    vi.doUnmock('@/icons/icons');
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

    it.each([
        ['espacios', '   '],
        ['saltos de línea y tabulaciones', '\n\t'],
    ])('una etiqueta en blanco (%s) tampoco: sigue siendo decorativo', async (_case, label) => {
        const { Icon } = await freshIcon();
        const wrapper = mount(Icon, { props: { name: 'sol', label } });

        expect(wrapper.attributes('role')).toBeUndefined();
        expect(wrapper.attributes('aria-label')).toBeUndefined();
        expect(wrapper.attributes('aria-hidden')).toBe('true');
    });

    it('la etiqueta se usa sin los espacios de los extremos', async () => {
        const { Icon } = await freshIcon();
        const wrapper = mount(Icon, { props: { name: 'sol', label: '  Tema claro ' } });

        expect(wrapper.attributes('role')).toBe('img');
        expect(wrapper.attributes('aria-label')).toBe('Tema claro');
        expect(wrapper.attributes('aria-hidden')).toBeUndefined();
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

    it('reintenta al volver la red', async () => {
        const loadIcon = vi
            .fn<Loader>()
            .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
            .mockResolvedValue(DRAWING);
        const Icon = await iconWithLoader(loadIcon);
        const wrapper = mount(Icon, { props: { name: 'sancocho', label: 'Sancocho' } });
        await flushPromises();

        // Sin red: vacío, con su nombre accesible.
        expect(loadIcon).toHaveBeenCalledTimes(1);
        expect(svg(wrapper).childElementCount).toBe(0);
        expect(wrapper.attributes('aria-label')).toBe('Sancocho');

        window.dispatchEvent(new Event('online'));
        await flushPromises();

        expect(loadIcon).toHaveBeenCalledTimes(2);
        expect(wrapper.findAll('path')).toHaveLength(1);

        // Ya pintado, no lo vuelve a pedir.
        window.dispatchEvent(new Event('online'));
        await flushPromises();

        expect(loadIcon).toHaveBeenCalledTimes(2);
    });

    it('si vuelve a fallar no insiste solo: un intento por cada vez que vuelve la red', async () => {
        const loadIcon = vi.fn<Loader>().mockRejectedValue(new TypeError('Failed to fetch'));
        const Icon = await iconWithLoader(loadIcon);
        mount(Icon, { props: { name: 'sancocho' } });
        await flushPromises();

        expect(loadIcon).toHaveBeenCalledTimes(1);

        window.dispatchEvent(new Event('online'));
        await flushPromises();
        await flushPromises();

        expect(loadIcon).toHaveBeenCalledTimes(2);

        window.dispatchEvent(new Event('online'));
        await flushPromises();

        expect(loadIcon).toHaveBeenCalledTimes(3);
    });

    it('al desmontar deja de esperar la red y quita su listener', async () => {
        const added = vi.spyOn(window, 'addEventListener');
        const removed = vi.spyOn(window, 'removeEventListener');
        const loadIcon = vi.fn<Loader>().mockRejectedValue(new TypeError('Failed to fetch'));
        const Icon = await iconWithLoader(loadIcon);
        const wrapper = mount(Icon, { props: { name: 'sancocho' } });
        await flushPromises();

        const listeners = added.mock.calls.filter(([type]) => type === 'online').map(([, listener]) => listener);

        expect(listeners).toHaveLength(1);

        wrapper.unmount();

        expect(removed.mock.calls.filter(([type]) => type === 'online').map(([, listener]) => listener)).toEqual(
            listeners,
        );

        window.dispatchEvent(new Event('online'));
        await flushPromises();

        expect(loadIcon).toHaveBeenCalledTimes(1);
    });

    it('si cambia el nombre, deja de reintentar el anterior', async () => {
        const loadIcon = vi.fn<Loader>((name) =>
            name === 'ajiaco' ? Promise.resolve(DRAWING) : Promise.reject(new TypeError('Failed to fetch')),
        );
        const Icon = await iconWithLoader(loadIcon);
        const wrapper = mount(Icon, { props: { name: 'sancocho' } });
        await flushPromises();
        await wrapper.setProps({ name: 'ajiaco' });
        await flushPromises();

        expect(wrapper.findAll('path')).toHaveLength(1);

        window.dispatchEvent(new Event('online'));
        await flushPromises();

        expect(loadIcon.mock.calls).toEqual([['sancocho'], ['ajiaco']]);
        expect(wrapper.attributes('data-icon')).toBe('ajiaco');
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
