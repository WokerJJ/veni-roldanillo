import { readFileSync } from 'node:fs';

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/*
| El módulo virtual de vite-plugin-pwa, simulado: la prueba dispara la versión
| nueva con las opciones del registro.
*/
const activate = vi.fn(() => Promise.resolve());
const registerSW = vi.fn((options: { onNeedRefresh?: () => void }) => {
    newVersion = () => options.onNeedRefresh?.();

    return activate;
});
let newVersion: () => void = () => undefined;

vi.mock('virtual:pwa-register', () => ({ registerSW }));

/** El aviso y el registro, copias nuevas, con la página en el idioma $locale. */
async function mountPrompt(locale: 'es' | 'en' = 'es', attachTo?: HTMLElement) {
    const fake = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    fake.reset();
    fake.page.props.locale = locale;
    fake.page.props.translations = { ...fake.messages[locale] };

    const { registerServiceWorker } = await import('@/pwa/serviceWorker');
    registerServiceWorker();

    const { default: UpdatePrompt } = await import('./UpdatePrompt.vue');
    const wrapper = mount(UpdatePrompt, attachTo ? { attachTo } : {});

    return { fake, wrapper, status: () => wrapper.get('[role="status"]') };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    activate.mockClear();
    // Un navegador con service worker y una versión nueva esperando.
    vi.stubGlobal('navigator', {
        serviceWorker: Object.assign(new EventTarget(), { getRegistration: () => Promise.resolve({ waiting: {} }) }),
    });
});

afterEach(() => {
    document.documentElement.style.removeProperty(PROMPT_SPACE);
    document.body.innerHTML = '';
});

/** Lo que el aviso deja en <html> mientras se ve (resources/js/pages/Home.vue lo usa). */
const PROMPT_SPACE = '--veni-update-prompt-space';

describe('UpdatePrompt', () => {
    it('sin versión nueva no se ve ni tiene botones, pero la región de estado ya está', async () => {
        const { wrapper, status } = await mountPrompt();

        expect(status().text()).toBe('');
        expect(wrapper.classes()).toContain('sr-only');
        expect(wrapper.findAll('button')).toHaveLength(0);
    });

    it('con una versión nueva avisa en la región de estado, con «Actualizar»', async () => {
        const { wrapper, status } = await mountPrompt();

        newVersion();
        await nextTick();

        expect(status().text()).toBe('Hay una versión nueva de Vení.');
        expect(wrapper.classes()).not.toContain('sr-only');
        expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Ahora no', 'Actualizar']);
    });

    it('los botones son reales y miden 44 px de alto', async () => {
        const { wrapper } = await mountPrompt();
        newVersion();
        await nextTick();

        for (const button of wrapper.findAll('button')) {
            expect(button.attributes('type')).toBe('button');
            expect(button.classes()).toContain('min-h-touch');
        }
    });

    it('en inglés', async () => {
        const { wrapper, status } = await mountPrompt('en');

        newVersion();
        await nextTick();

        expect(status().text()).toBe('There is a new version of Vení.');
        expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Not now', 'Update']);
    });

    it('«Actualizar» activa la versión nueva y el aviso se va', async () => {
        const { wrapper, status } = await mountPrompt();
        newVersion();
        await nextTick();

        await wrapper.findAll('button')[1]?.trigger('click');

        expect(activate).toHaveBeenCalledOnce();
        expect(status().text()).toBe('');
    });

    it('«Ahora no» lo cierra sin activar nada', async () => {
        const { wrapper, status } = await mountPrompt();
        newVersion();
        await nextTick();

        await wrapper.findAll('button')[0]?.trigger('click');

        expect(activate).not.toHaveBeenCalled();
        expect(status().text()).toBe('');
        expect(wrapper.findAll('button')).toHaveLength(0);
    });
});

/*
| Los botones desaparecen con el aviso. Si el foco estaba en uno, el navegador
| lo deja en <body>: quien navega con teclado o lector de pantalla tendría que
| recorrer la página otra vez desde el principio.
*/
describe('UpdatePrompt · foco al cerrar con «Ahora no»', () => {
    /** La página alrededor del aviso, como en AppLayout.vue: un enlace dentro de <main id="contenido">. */
    async function mountInPage() {
        document.body.innerHTML = '<main id="contenido" tabindex="-1"><a id="antes" href="/almuerzos">Almuerzos de hoy</a></main><div id="aviso"></div>';
        const mounted = await mountPrompt('es', document.getElementById('aviso') ?? undefined);
        newVersion();
        await nextTick();
        const [dismiss, update] = mounted.wrapper.findAll('button');

        if (dismiss === undefined || update === undefined) {
            throw new Error('El aviso no tiene sus dos botones.');
        }

        return {
            dismiss,
            update,
            main: document.getElementById('contenido'),
            before: document.getElementById('antes'),
        };
    }

    it('vuelve al elemento que lo tenía antes de entrar al aviso', async () => {
        const { dismiss, before } = await mountInPage();
        before?.focus();
        dismiss.element.focus();

        await dismiss.trigger('click');

        expect(document.activeElement).toBe(before);
    });

    it('pasar de un botón del aviso al otro no cambia a quién vuelve', async () => {
        const { dismiss, update, before } = await mountInPage();
        before?.focus();
        update.element.focus();
        dismiss.element.focus();

        await dismiss.trigger('click');

        expect(document.activeElement).toBe(before);
    });

    it('si ese elemento ya no está en la página, va al contenido', async () => {
        const { dismiss, main, before } = await mountInPage();
        before?.focus();
        dismiss.element.focus();
        before?.remove();

        await dismiss.trigger('click');

        expect(document.activeElement).toBe(main);
    });

    it('si nadie lo tenía antes, va al contenido', async () => {
        const { dismiss, main } = await mountInPage();
        dismiss.element.focus();

        await dismiss.trigger('click');

        expect(document.activeElement).toBe(main);
    });

    it('si el foco no estaba en el aviso, no lo mueve', async () => {
        const { dismiss, before } = await mountInPage();
        before?.focus();

        // Un toque: hay navegadores que no le dan el foco al botón.
        await dismiss.trigger('click');

        expect(document.activeElement).toBe(before);
    });
});

/*
| Abajo, en el inicio, ya están la atribución de OpenStreetMap y, en un
| celular vertical, la bienvenida: el aviso no puede taparlas.
*/
describe('UpdatePrompt · lugar en la pantalla', () => {
    it('flota encima de la franja de la atribución del mapa, con la holgura común', async () => {
        const { wrapper } = await mountPrompt();
        newVersion();
        await nextTick();

        expect(wrapper.classes()).toContain('bottom-(--veni-attribution-clearance)');
    });

    it('la holgura está definida una vez, en la hoja de estilos de la app', () => {
        // Del disco (desde la raíz del repositorio, donde corre Vitest): las
        // hojas de estilos que se importan en una prueba llegan vacías.
        const css = readFileSync('resources/css/app.css', 'utf8');

        expect(css.match(/--veni-attribution-clearance:/g)).toHaveLength(1);
    });

    it('mientras se ve, deja en <html> el lugar que ocupa; al cerrarse, lo quita', async () => {
        let resized: () => void = () => undefined;
        vi.stubGlobal(
            'ResizeObserver',
            class {
                constructor(callback: () => void) {
                    resized = callback;
                }

                observe(): void {}

                disconnect(): void {}
            },
        );
        const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(96);
        const { wrapper } = await mountPrompt();
        const space = () => document.documentElement.style.getPropertyValue(PROMPT_SPACE);

        expect(space()).toBe('');

        newVersion();
        await nextTick();
        expect(space()).toBe('calc(96px + 0.5rem)');

        // Con el texto agrandado o al rotar el teléfono, el aviso crece.
        height.mockReturnValue(140);
        resized();
        expect(space()).toBe('calc(140px + 0.5rem)');

        await wrapper.findAll('button')[0]?.trigger('click');
        expect(space()).toBe('');
    });

    it('al desmontarse no deja nada en <html>', async () => {
        const { wrapper } = await mountPrompt();
        newVersion();
        await nextTick();

        wrapper.unmount();

        expect(document.documentElement.style.getPropertyValue(PROMPT_SPACE)).toBe('');
    });
});
