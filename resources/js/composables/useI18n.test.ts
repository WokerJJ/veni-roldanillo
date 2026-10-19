import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import type * as FakeInertia from '@/testing/inertia';

import type * as I18nModule from './useI18n';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/**
 * El watcher de <html lang> es de módulo: cada prueba importa una copia nueva
 * del composable. El doble se pide por '@inertiajs/vue3' (la misma copia que
 * ve el composable) y se reinicia.
 */
async function load() {
    const fake = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    fake.reset();
    const module: typeof I18nModule = await import('./useI18n');

    return { fake, useI18n: module.useI18n };
}

/** Componente que traduce el título del inicio con el composable de la prueba. */
function mountHeading(useI18n: typeof I18nModule.useI18n) {
    return mount(
        defineComponent({
            setup() {
                const { t } = useI18n();

                return () => h('h1', t('home.heading'));
            },
        }),
    );
}

/** La <meta name="description"> que pinta el servidor en la vista raíz, en español. */
function serverDescription(fake: typeof FakeInertia): HTMLMetaElement {
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = fake.messages.es['meta.description'];
    document.head.append(meta);

    return meta;
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    // Lo que deja el servidor en <html lang> antes de que arranque Vue.
    document.documentElement.lang = 'es';
    // En desarrollo, una clave sin traducción avisa en la consola (translate.test.ts).
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
    document.head.querySelector('meta[name="description"]')?.remove();
});

describe('useI18n', () => {
    it('traduce con los textos que comparte el servidor e interpola', async () => {
        const { useI18n } = await load();
        const { t, locale } = useI18n();

        expect(locale.value).toBe('es');
        expect(t('home.title')).toBe('Inicio');
        expect(t('layout.footer', { year: 2026 })).toContain('© 2026 Vení Roldanillo');
    });

    it('una clave que no llegó del servidor se muestra como la clave', async () => {
        const { fake, useI18n } = await load();
        fake.page.props.translations = {};

        expect(useI18n().t('home.title')).toBe('home.title');
    });

    it('t() solo acepta las claves de lang/es.json', async () => {
        const { useI18n } = await load();

        // @ts-expect-error «no.existe» no es una clave: si t() aceptara cualquier texto, vue-tsc fallaría en esta línea.
        expect(useI18n().t('no.existe')).toBe('no.existe');
    });

    it('al cambiar el idioma sin recargar, cambian los textos y <html lang>', async () => {
        const { fake, useI18n } = await load();

        const wrapper = mountHeading(useI18n);
        expect(wrapper.text()).toBe('Vení, comamos en Roldanillo');

        // Lo que hace Inertia al recibir la página en inglés.
        fake.page.props.locale = 'en';
        fake.page.props.translations = { ...fake.messages.en };
        await nextTick();

        expect(wrapper.text()).toBe('Come eat in Roldanillo');
        expect(document.documentElement.lang).toBe('en');
    });

    it('mantiene <html lang> aunque se desmonte el componente que lo empezó a seguir', async () => {
        const { fake, useI18n } = await load();
        mountHeading(useI18n).unmount();

        fake.page.props.locale = 'en';
        await nextTick();

        expect(document.documentElement.lang).toBe('en');
    });

    it('al cambiar el idioma sin recargar, cambia la descripción del documento', async () => {
        const { fake, useI18n } = await load();
        const meta = serverDescription(fake);
        mountHeading(useI18n);

        fake.receiveFromServer('en', { replace: true });
        await nextTick();

        expect(meta.content).toBe(fake.messages.en['meta.description']);
        expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    });

    it('deja la descripción que pintó el servidor si no llegan traducciones', async () => {
        const { fake, useI18n } = await load();
        const meta = serverDescription(fake);
        mountHeading(useI18n);

        fake.page.props.translations = {};
        await nextTick();

        expect(meta.content).toBe(fake.messages.es['meta.description']);
    });

    it('al llegar a una página con descripción propia, el documento lleva esa; al salir, vuelve la general', async () => {
        const { fake, useI18n } = await load();
        const meta = serverDescription(fake);
        mountHeading(useI18n);

        // Del inicio a la ficha de un restaurante, sin recargar.
        fake.receiveFromServer('es', { meta: { title: 'La Ceiba (ficticio)', description: 'Sancocho de prueba en fogón de leña.' } });
        await nextTick();

        expect(meta.content).toBe('Sancocho de prueba en fogón de leña.');

        // Y de vuelta al inicio, que no manda la suya.
        fake.receiveFromServer('es');
        await nextTick();

        expect(meta.content).toBe(fake.messages.es['meta.description']);
        expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    });

    it('en una página con descripción propia, cambiar de idioma trae la del idioma nuevo, no la general', async () => {
        const { fake, useI18n } = await load();
        const meta = serverDescription(fake);
        mountHeading(useI18n);
        fake.receiveFromServer('es', { meta: { title: 'La Ceiba (ficticio)', description: 'Sancocho de prueba en fogón de leña.' } });
        await nextTick();

        fake.receiveFromServer('en', { replace: true, meta: { title: 'La Ceiba (ficticio)', description: 'Test sancocho cooked over a wood fire.' } });
        await nextTick();

        expect(meta.content).toBe('Test sancocho cooked over a wood fire.');
    });
});

/*
| La página sin conexión (resources/js/offline.ts) muestra el último idioma
| con que respondió el servidor: sin red no tiene a quién preguntarle.
*/
describe('useI18n · idioma para la página sin conexión', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('recuerda en el dispositivo el idioma con que respondió el servidor', async () => {
        const { fake, useI18n } = await load();
        const { LOCALE_STORAGE_KEY } = await import('./useI18n');
        mountHeading(useI18n);

        expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('es');

        fake.receiveFromServer('en', { replace: true });
        await nextTick();

        expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    });

    it('al volver a una página guardada en otro idioma, sigue recordando el del servidor', async () => {
        const { fake, useI18n } = await load();
        const { LOCALE_STORAGE_KEY } = await import('./useI18n');
        mountHeading(useI18n);
        fake.receiveFromServer('en', { replace: true });
        await nextTick();

        // Atrás: Inertia muestra la página guardada en español y se pide de
        // nuevo; sin red, esa recarga no llega y lo último del servidor es inglés.
        fake.restoreFromHistory('es');
        await nextTick();

        expect(document.documentElement.lang).toBe('es');
        expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    });

    it('sin almacenamiento, traduce igual', async () => {
        vi.stubGlobal('localStorage', {
            setItem: vi.fn(() => {
                throw new DOMException('Acceso denegado', 'SecurityError');
            }),
        });
        const { useI18n } = await load();

        expect(mountHeading(useI18n).text()).toBe('Vení, comamos en Roldanillo');
    });

    it('usa la misma clave que la página sin conexión', async () => {
        const { LOCALE_STORAGE_KEY } = await import('./useI18n');
        const { THEME_STORAGE_KEY } = await import('./useTheme');
        const offline = (await import('@/offline.ts?raw')).default;

        expect(offline).toContain(`LOCALE_STORAGE_KEY = '${LOCALE_STORAGE_KEY}'`);
        expect(offline).toContain(`THEME_STORAGE_KEY = '${THEME_STORAGE_KEY}'`);
    });
});

describe('useI18n · cambio de idioma e historial', () => {
    it('pide el idioma al servidor en PUT /locale y reemplaza la entrada del historial', async () => {
        const { fake, useI18n } = await load();

        useI18n().setLocale('en');

        // Sin reemplazar, «atrás» volvería a la misma página guardada en el idioma anterior.
        expect(fake.router.put).toHaveBeenCalledExactlyOnceWith(
            '/locale',
            { locale: 'en' },
            expect.objectContaining({ preserveScroll: true, preserveState: true, replace: true }),
        );
    });

    it('sin red no pide nada y avisa a quien eligió el idioma', async () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        const { fake, useI18n } = await load();
        const onOffline = vi.fn();

        useI18n().setLocale('en', { onOffline });

        expect(fake.router.put).not.toHaveBeenCalled();
        expect(onOffline).toHaveBeenCalledOnce();
    });

    it('si la petición no llega, avisa y corta el error de Inertia', async () => {
        const { fake, useI18n } = await load();
        const onOffline = vi.fn();

        useI18n().setLocale('en', { onOffline });
        const options = fake.router.put.mock.lastCall?.[2] as { onNetworkError: (error: Error) => boolean | undefined };

        expect(options.onNetworkError(new Error('Network Error'))).toBe(false);
        expect(onOffline).toHaveBeenCalledOnce();
    });

    it('sin quien avise, el error de red sigue su curso en Inertia', async () => {
        const { fake, useI18n } = await load();

        useI18n().setLocale('en');
        const options = fake.router.put.mock.lastCall?.[2] as { onNetworkError: (error: Error) => boolean | undefined };

        expect(options.onNetworkError(new Error('Network Error'))).toBeUndefined();
    });

    it('al volver a una página guardada en otro idioma pide recargarla', async () => {
        const { fake, useI18n } = await load();
        useI18n();

        // El selector: el servidor responde en inglés la página actual.
        fake.receiveFromServer('en', { replace: true });
        expect(fake.router.reload).not.toHaveBeenCalled();

        // Atrás: Inertia muestra la página anterior, guardada en español.
        fake.restoreFromHistory('es');

        expect(fake.router.reload).toHaveBeenCalledOnce();
    });

    it('la respuesta de esa recarga no pide otra, aunque llegue en el idioma de la página guardada', async () => {
        const { fake, useI18n } = await load();
        useI18n();
        fake.receiveFromServer('en', { replace: true });
        fake.restoreFromHistory('es');

        // La URL guardada lleva ?lang=es: el servidor responde en español.
        fake.receiveFromServer('es', { replace: true });
        // Y en inglés, como entrada nueva del historial.
        fake.receiveFromServer('en');

        expect(fake.router.reload).toHaveBeenCalledOnce();
    });

    it('al volver a una página guardada en el idioma actual no recarga', async () => {
        const { fake, useI18n } = await load();
        useI18n();

        fake.restoreFromHistory('es');

        expect(fake.router.reload).not.toHaveBeenCalled();
    });

    it('una visita en la que el servidor cambia el idioma (?lang) no recarga', async () => {
        const { fake, useI18n } = await load();
        useI18n();

        fake.receiveFromServer('en');
        await nextTick();

        expect(fake.router.reload).not.toHaveBeenCalled();
        expect(document.documentElement.lang).toBe('en');
    });

    it('sigue el historial una sola vez aunque traduzcan varios componentes', async () => {
        const { fake, useI18n } = await load();
        mountHeading(useI18n);
        mountHeading(useI18n);
        fake.receiveFromServer('en', { replace: true });

        fake.restoreFromHistory('es');

        expect(fake.router.reload).toHaveBeenCalledOnce();
    });
});
