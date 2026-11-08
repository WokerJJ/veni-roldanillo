import { readFileSync } from 'node:fs';

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { h } from 'vue';

import type { Restaurant } from '@/restaurants/api';
import { NO_FILTERS } from '@/restaurants/filterParams';
import type * as FakeInertia from '@/testing/inertia';
import { desktopWidth, phoneWidth, stubMedia } from '@/testing/media';
import { EL_GUADUAL, LA_CEIBA, restaurant, stubRestaurantsFetch } from '@/testing/restaurants';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));
// El mapa tiene sus propias pruebas (components/MapView.test.ts): aquí queda
// cargando, salvo en las pruebas que lo hacen fallar.
const engine = vi.hoisted(() => ({ fails: false }));
vi.mock('@/map/engine', () => ({
    createMap: () => (engine.fails ? Promise.reject(new Error('El navegador no pudo crear el mapa.')) : new Promise(() => undefined)),
}));
// Sin mapa, el ícono de los marcadores no llega a usarse (happy-dom no decodifica imágenes).
vi.mock('@/map/iconImage', () => ({ iconImage: () => new Promise(() => undefined) }));

/**
 * El inicio, con la red de mentira: `answer` son los restaurantes que llegan
 * enseguida; sin él, el pedido queda en `network` para que la prueba lo
 * responda, lo haga fallar o lo deje esperando.
 */
async function mountHome({
    locale = 'es',
    answer,
    url = '/',
    beforeChunks,
    inLayout = false,
}: {
    locale?: 'es' | 'en';
    answer?: readonly Restaurant[];
    url?: string;
    /** Lo que pasa recién montado, antes de que bajen el resumen y la lista. */
    beforeChunks?: () => void;
    /** Dentro del layout de verdad, que le da al inicio el idioma y el tema (`provide`). */
    inLayout?: boolean;
} = {}) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });
    // La dirección con que el servidor respondió el inicio (con ?r=slug, la de «Ver en el mapa»).
    inertia.page.url = url;
    // La visita que cambia la dirección en el dispositivo, sin pedirle nada al
    // servidor ni sumar una entrada al historial: el router de mentira no la trae.
    const replace = vi.fn();
    Object.assign(inertia.router, { replace });
    // Los demás pedidos (MapView pide el estilo al montarse) no llegan nunca: aquí nada sale a la red.
    const network = stubRestaurantsFetch(answer);

    const { default: Home } = await import('./Home.vue');
    const host = document.createElement('div');
    document.body.append(host);
    const wrapper = inLayout
        ? mount((await import('@/layouts/AppLayout.vue')).default, { props: { immersive: true }, slots: { default: () => h(Home) }, attachTo: host })
        : mount(Home, { attachTo: host });
    beforeChunks?.();
    // El resumen y la lista bajan aparte, apenas monta (ADR 0022).
    await vi.dynamicImportSettled();
    await flushPromises();

    /** El panel sobre el mapa: va primero en el documento. */
    const panel = () => wrapper.get('section');

    return {
        Home,
        inertia,
        network,
        replace,
        wrapper,
        panel,
        /** La región que anuncia el estado de los restaurantes. */
        status: () => panel().get('[role="status"]'),
        // El espacio que no parte la línea de «3:00 p. m.» se compara como uno común.
        openStatus: () => panel().get('[data-status]').text().replaceAll(' ', ' '),
        /** El buscador de la bienvenida (#139): abre la lista con el foco en el campo. Antes, «Ver la lista». */
        listButton: () => panel().findAll('button').find((button) => button.attributes('data-search-open') !== undefined),
        items: () => wrapper.findAll('button[data-slug]'),
        layer: () => wrapper.getComponent({ name: 'RestaurantsLayer' }),
        map: () => wrapper.get('section[aria-busy]'),
        /** Alguien toca ese restaurante en el mapa: lo avisa la capa (el mapa de aquí no llega a pintar). */
        tapOnMap: async (slug: string) => {
            (wrapper.getComponent({ name: 'RestaurantsLayer' }).vm as unknown as { $emit: (event: 'select', slug: string) => void }).$emit('select', slug);
            await flushPromises();
        },
        pressEscape: async () => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            await flushPromises();
        },
    };
}

/** El inicio con dos restaurantes ya en el mapa y la lista abierta. */
async function mountWithList() {
    const home = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
    await home.listButton()?.trigger('click');
    await flushPromises();

    return home;
}

/**
 * El panel con su transición de alto (happy-dom no aplica las clases) y lo
 * que la capa de los restaurantes hace cuando el panel termina de moverse.
 */
function watchSheetMoves(home: Awaited<ReturnType<typeof mountHome>>) {
    const element = home.panel().element;
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((target) =>
        target === element ? ({ transitionDuration: '0.2s' } as CSSStyleDeclaration) : computed(target),
    );
    const reveal = vi.fn();
    // La capa baja aparte (ADR 0022): la página la guarda en `layer` cuando llega.
    Object.assign((home.wrapper.vm as unknown as { layer: object }).layer, { reveal });

    return {
        reveal,
        /** Termina la transición del alto máximo del panel. */
        finish: async () => {
            const end = new Event('transitionend');
            Object.defineProperty(end, 'propertyName', { value: 'max-height' });
            element.dispatchEvent(end);
            await flushPromises();
        },
    };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    engine.fails = false;
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // Miércoles 7 de octubre de 2026, 12:30 en Colombia: La Ceiba (11 a 15) está abierta.
    vi.setSystemTime(new Date('2026-10-07T12:30:00-05:00'));
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://tiles.example.test/veni-{theme}-{locale}.json');
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    document.body.replaceChildren();
});

describe('Home', () => {
    it('le pide al layout el modo inmersivo: el mapa ocupa todo bajo la cabecera', async () => {
        const { Home, wrapper } = await mountHome();

        expect((Home as { layout?: unknown }).layout).toEqual({ immersive: true });
        expect(wrapper.get('inertia-head + div').classes()).toEqual(expect.arrayContaining(['absolute', 'inset-0']));
    });

    it('el inicio no tiene pie: la bienvenida enlaza los créditos de OpenStreetMap', async () => {
        const { wrapper } = await mountHome();

        const credits = wrapper.get('section [data-credits]');
        expect(credits.attributes('href')).toBe('/credits');
        expect(credits.text()).toBe('Créditos y datos de OpenStreetMap');
    });

    it('la bienvenida ya no enlaza la guía de platos: en el celular va en la barra de pestañas (#139)', async () => {
        const { wrapper } = await mountHome({ locale: 'en' });
        await vi.dynamicImportSettled();

        expect(wrapper.find('section [data-dish-guide-link]').exists()).toBe(false);
    });

    it('«Ajustes» del celular, al final de la bienvenida, lleva el idioma y el tema que le da el layout (#139)', async () => {
        const { wrapper } = await mountHome({ answer: [LA_CEIBA] });
        const settings = wrapper.get('section [data-settings]');

        expect(settings.get('h2').text()).toBe('Ajustes');
        expect(settings.attributes('aria-labelledby')).toBe(settings.get('h2').attributes('id'));
        // Sin layout (esta prueba monta la página sola) no hay controles; con él, los de la cabecera (AppLayout.test.ts).
        expect(settings.findAll('button')).toHaveLength(0);
    });

    it('muestra el mapa de Roldanillo', async () => {
        const { map } = await mountHome();

        expect(map().attributes('aria-label')).toBe('Mapa de Roldanillo');
    });

    it.each([
        ['es', 'Inicio', 'Vení, comamos en Roldanillo', 'Mirá los menús con precios y horarios'],
        ['en', 'Home', 'Come eat in Roldanillo', 'Browse menus with prices and opening hours'],
    ] as const)('en %s pone el título y una sola bienvenida sobre el mapa', async (locale, title, heading, intro) => {
        const { wrapper, panel } = await mountHome({ locale });

        expect(wrapper.get('inertia-head').attributes('title')).toBe(title);
        expect(wrapper.findAll('h1')).toHaveLength(1);
        expect(wrapper.get('h1').text()).toBe(heading);
        expect(panel().text()).toContain(intro);
    });

    it('la bienvenida deja libre la barra de pestañas (el crédito del mapa va arriba, #139) y se corre sobre el aviso de versión nueva', async () => {
        const { panel } = await mountHome();

        // La misma holgura que el aviso (UpdatePrompt.vue) más el lugar que él ocupa cuando se ve.
        expect(panel().classes()).toContain('bottom-[calc(var(--veni-tabbar-space)_+_var(--veni-update-prompt-space,0px))]');
    });

    it('en el celular el panel va abajo, sin pasar del alto de su altura; desde 768 px (o acostado), a la izquierda, sin pasar del mapa', async () => {
        const { panel } = await mountHome();

        expect(panel().classes()).toEqual(expect.arrayContaining(['max-h-(--sheet-height)', 'side:max-h-[calc(100%_-_var(--veni-tabbar-space)_-_1rem)]', 'side:top-4']));
        expect(panel().attributes('style')).toContain('--sheet-height: 8.5rem');
    });

    it('el panel toma la altura de lo que muestra: asomado con la bienvenida, completo con la lista y a media altura con un resumen', async () => {
        const { panel, listButton, items } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        expect(panel().attributes('data-sheet')).toBe('peek');

        // El buscador de la bienvenida la abre a la altura completa (#138, A2; #139).
        await listButton()?.trigger('click');
        expect(panel().attributes('data-sheet')).toBe('full');

        // Quien la cambia con la manija manda, hasta que el panel muestra otra cosa.
        await panel().get('[data-sheet-handle]').trigger('keydown', { key: 'ArrowDown' });
        expect(panel().attributes('data-sheet')).toBe('half');
        await panel().get('[data-sheet-handle]').trigger('keydown', { key: 'ArrowUp' });
        expect(panel().attributes('data-sheet')).toBe('full');

        await items()[0]?.trigger('click');
        expect(panel().attributes('data-sheet')).toBe('half');
    });

    it('si no hay restaurantes, el aviso abre el panel a media altura para leerse', async () => {
        const { panel } = await mountHome({ answer: [] });

        expect(panel().attributes('data-sheet')).toBe('half');
    });

    it('le pasa al mapa su panel: al ubicarse, la cámara deja la ubicación fuera de él', async () => {
        const { wrapper, panel } = await mountHome();

        expect(wrapper.getComponent({ name: 'MapView' }).props('overlay')).toBe(panel().element);
    });

    it('no pone botones de tema ni de idioma sobre el mapa: van en «Ajustes», al final del panel (#139)', async () => {
        const { wrapper } = await mountHome({ answer: [LA_CEIBA] });

        // La manija del panel no es un botón del mapa: cambia el alto del panel.
        // «Sugerime algo» y «Almuerzos de hoy» son de la bienvenida (#12).
        expect(wrapper.findAll('button:not([data-sheet-handle])').map((button) => button.text())).toEqual(['Buscá dónde comer', 'Sugerime algo']);
    });

    describe('los restaurantes', () => {
        it('van sobre el mapa, en el idioma de la interfaz', async () => {
            const { layer, network, wrapper } = await mountHome({ locale: 'en', answer: [LA_CEIBA, EL_GUADUAL] });

            expect(network.urls()).toEqual(['/api/restaurants.geojson?lang=en']);
            // Sin filtros en la dirección (#12): los filtros están, vacíos.
            expect(layer().props()).toEqual({ restaurants: [LA_CEIBA, EL_GUADUAL], selected: null, filters: NO_FILTERS });
            // La capa va dentro del mapa: recibe de él con qué pintar (ADR 0016).
            expect(wrapper.getComponent({ name: 'MapView' }).findComponent({ name: 'RestaurantsLayer' }).exists()).toBe(true);
        });

        it.each([
            ['es', 'Cargando los restaurantes…'],
            ['en', 'Loading the restaurants…'],
        ] as const)('mientras llegan, lo dice (%s) y todavía no ofrece la lista', async (locale, text) => {
            const { status, listButton, layer } = await mountHome({ locale });

            expect(status().text()).toBe(text);
            expect(status().attributes('aria-busy')).toBe('true');
            expect(listButton()).toBeUndefined();
            expect(layer().props('restaurants')).toEqual([]);
        });

        it.each([
            ['es', '2 restaurantes en el mapa', 'Buscá dónde comer'],
            ['en', '2 restaurants on the map', 'Find where to eat'],
        ] as const)('cuando llegan, dice cuántos hay (%s) y ofrece la lista', async (locale, text, label) => {
            const { status, listButton } = await mountHome({ locale, answer: [LA_CEIBA, EL_GUADUAL] });

            expect(status().text()).toBe(text);
            expect(status().attributes('aria-busy')).toBe('false');
            expect(listButton()?.text()).toBe(label);
            expect(listButton()?.classes()).toContain('min-h-touch');
        });

        it.each([
            ['es', '1 restaurante en el mapa'],
            ['en', '1 restaurant on the map'],
        ] as const)('si hay uno solo, lo dice en singular (%s)', async (locale, text) => {
            const { status } = await mountHome({ locale, answer: [LA_CEIBA] });

            expect(status().text()).toBe(text);
        });

        it('con restaurantes en el mapa, en un celular vertical la presentación les deja el lugar', async () => {
            const loading = await mountHome();
            expect(loading.panel().get('h1 + p').classes()).not.toContain('sheet:hidden');
            loading.wrapper.unmount();

            const ready = await mountHome({ answer: [LA_CEIBA] });
            expect(ready.panel().get('h1 + p').classes()).toContain('sheet:hidden');
        });
    });

    describe('sin restaurantes', () => {
        it.each([
            ['es', 'Todavía no hay restaurantes en el mapa. Volvé pronto, que ya los estamos sumando.'],
            ['en', "There are no restaurants on the map yet. Come back soon, we're adding them."],
        ] as const)('lo dice (%s), sin lista que ofrecer ni error', async (locale, text) => {
            const { panel, status, listButton } = await mountHome({ locale, answer: [] });

            expect(status().text()).toBe(text);
            expect(listButton()).toBeUndefined();
            expect(panel().find('[role="alert"]').exists()).toBe(false);
            expect(panel().find('[data-sample]').exists()).toBe(false);
        });
    });

    describe('si los restaurantes no llegan', () => {
        async function mountFailed(locale: 'es' | 'en' = 'es') {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const home = await mountHome({ locale });
            home.network.last()?.fail();
            await flushPromises();

            return { ...home, alert: () => home.panel().get('[role="alert"]') };
        }

        it.each([
            ['es', 'No pudimos cargar los restaurantes. Revisá tu conexión y volvé a intentar.', 'Reintentar'],
            ['en', "We couldn't load the restaurants. Check your connection and try again.", 'Try again'],
        ] as const)('lo avisa (%s) y deja reintentar con un botón de 44 px', async (locale, text, label) => {
            const { alert, listButton } = await mountFailed(locale);

            expect(alert().get('p').text()).toBe(text);
            expect(alert().get('button').text()).toBe(label);
            expect(alert().get('button').attributes('type')).toBe('button');
            expect(alert().get('button').classes()).toContain('min-h-touch');
            expect(listButton()).toBeUndefined();
        });

        it('el mapa sigue ahí, sin restaurantes', async () => {
            const { layer, map } = await mountFailed();

            expect(map().attributes('aria-label')).toBe('Mapa de Roldanillo');
            expect(layer().props('restaurants')).toEqual([]);
        });

        it('reintentar los vuelve a pedir y lleva el foco al estado, que dice que están cargando', async () => {
            const { alert, network, panel, status } = await mountFailed();

            await alert().get('button').trigger('click');

            expect(network.requests).toHaveLength(2);
            expect(panel().find('[role="alert"]').exists()).toBe(false);
            expect(status().text()).toBe('Cargando los restaurantes…');
            // El botón desapareció: el foco no se pierde al principio de la página.
            expect(document.activeElement).toBe(status().element);
        });

        it('si el reintento llega, aparecen', async () => {
            const { alert, network, status, layer } = await mountFailed();
            await alert().get('button').trigger('click');

            network.last()?.respond([LA_CEIBA, EL_GUADUAL]);
            await flushPromises();

            expect(status().text()).toBe('2 restaurantes en el mapa');
            expect(layer().props('restaurants')).toEqual([LA_CEIBA, EL_GUADUAL]);
        });

        it('si el reintento tampoco llega, vuelve el aviso', async () => {
            const { alert, network } = await mountFailed();
            await alert().get('button').trigger('click');

            network.last()?.respondWith({ status: 503 });
            await flushPromises();

            expect(alert().get('button').text()).toBe('Reintentar');
        });
    });

    describe('si el mapa no carga', () => {
        async function mountWithoutMap() {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            engine.fails = true;
            const home = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
            // El motor del mapa llega con import(): el mapa falla después de montar.
            await vi.dynamicImportSettled();
            await flushPromises();

            return { ...home, page: () => home.wrapper.get('inertia-head + div'), mapAlert: () => home.map().get('[role="alert"]') };
        }

        it('el aviso del mapa no tapa el panel: va debajo, y la lista se sigue viendo', async () => {
            const { listButton, mapAlert, page, panel, status, wrapper } = await mountWithoutMap();

            // Ya no va encima del mapa.
            expect(wrapper.getComponent({ name: 'MapView' }).props('overlay')).toBeNull();

            expect(mapAlert().get('button').text()).toBe('Reintentar');
            // El aviso ocupa todo su mapa. El panel deja de flotar encima (quedaría
            // tapado): va antes, en una columna, y el mapa se queda con el resto.
            expect(page().classes()).toEqual(expect.arrayContaining(['flex', 'flex-col']));
            expect(panel().classes()).not.toContain('absolute');
            expect(status().text()).toBe('2 restaurantes en el mapa');
            expect(listButton()?.text()).toBe('Buscá dónde comer');
        });

        it('la lista, que es la alternativa al mapa, se abre y deja elegir un restaurante', async () => {
            const { items, listButton, panel } = await mountWithoutMap();

            await listButton()?.trigger('click');
            await flushPromises();

            expect(items().map((item) => item.attributes('data-slug'))).toEqual(['prueba-la-ceiba', 'prueba-el-guadual']);
            // Desde el buscador de la bienvenida (#139): el foco va al campo.
            expect(document.activeElement).toBe(panel().get('input[type="search"]').element);

            await items()[0]?.trigger('click');
            await flushPromises();

            expect(panel().get('[role="dialog"] h2').text()).toBe('Restaurante de Prueba La Ceiba (ficticio)');
        });

        it('al reintentar, con el mapa cargando otra vez, el panel vuelve a ir sobre él', async () => {
            const { mapAlert, page, panel } = await mountWithoutMap();
            engine.fails = false;

            await mapAlert().get('button').trigger('click');
            await flushPromises();

            expect(page().classes()).not.toContain('flex');
            expect(panel().classes()).toContain('absolute');
        });
    });

    describe('datos de ejemplo', () => {
        it.each([
            ['es', 'Datos de ejemplo'],
            ['en', 'Sample data'],
        ] as const)('si alguno es ficticio, lo dice junto a la cantidad (%s)', async (locale, text) => {
            const { panel } = await mountHome({ locale, answer: [restaurant({ slug: 'la-real', fictitious: false }), LA_CEIBA] });

            expect(panel().get('[data-sample]').text()).toBe(text);
            expect(panel().findAll('[data-sample]')).toHaveLength(1);
        });

        it('si ninguno lo es, no lo dice', async () => {
            const { panel } = await mountHome({ answer: [restaurant({ fictitious: false })] });

            expect(panel().find('[data-sample]').exists()).toBe(false);
        });
    });

    describe('la lista', () => {
        it('cada restaurante de la lista enlaza a su ficha', async () => {
            const { panel } = await mountWithList();

            expect(panel().findAll('li > a').map((link) => link.attributes('href'))).toEqual(['/restaurants/prueba-la-ceiba', '/restaurants/prueba-el-guadual']);
        });

        it('se abre con el buscador de la bienvenida, con todos los restaurantes y el foco en el campo (#139)', async () => {
            const { items, panel, wrapper } = await mountWithList();

            expect(items().map((item) => item.attributes('data-slug'))).toEqual(['prueba-la-ceiba', 'prueba-el-guadual']);
            expect(document.activeElement).toBe(panel().get('input[type="search"]').element);
            // El título de la página sigue en el documento, y sigue siendo uno.
            expect(wrapper.findAll('h1')).toHaveLength(1);
            expect(wrapper.get('h1').classes()).toContain('sr-only');
        });

        it('al cerrarla vuelve la bienvenida y el foco queda en el botón que la abrió', async () => {
            const { items, listButton, panel, wrapper } = await mountWithList();

            await panel().get('button[aria-label="Cerrar la lista"]').trigger('click');
            await flushPromises();

            expect(items()).toHaveLength(0);
            expect(wrapper.get('h1').classes()).not.toContain('sr-only');
            expect(document.activeElement).toBe(listButton()?.element);
        });

        it('Escape también la cierra', async () => {
            const { items, listButton, pressEscape } = await mountWithList();

            await pressEscape();

            expect(items()).toHaveLength(0);
            expect(document.activeElement).toBe(listButton()?.element);
        });
    });

    describe('si el resumen y la lista no bajan (sin señal)', () => {
        /** Lo que puede tardar en bajar un componente con import() la primera vez. */
        const IMPORT_TIMEOUT = 10_000;

        /** La lista llega con import(): los primeros `failures` pedidos fallan, como sin señal. */
        function failListImport(failures: number) {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const listImport = { failures, calls: 0 };
            vi.doMock('@/components/RestaurantList.vue', async (importOriginal) => {
                listImport.calls += 1;

                if (listImport.failures > 0) {
                    listImport.failures -= 1;
                    throw new TypeError('Failed to fetch dynamically imported module');
                }

                return await importOriginal();
            });
            onTestFinished(() => {
                vi.doUnmock('@/components/RestaurantList.vue');
                errors.mockRestore();
            });

            return listImport;
        }

        it('aunque no bajen, la bienvenida del celular dice «Datos de ejemplo» en su lugar de siempre (ADR 0022)', async () => {
            failListImport(Number.POSITIVE_INFINITY);
            const { panel } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });

            await vi.waitFor(
                () => {
                    expect(panel().find('[data-panel-offline]').exists()).toBe(true);
                },
                { timeout: IMPORT_TIMEOUT },
            );
            const badge = panel().get('[data-sample]');
            expect(badge.text()).toBe('Datos de ejemplo');
            // Al lado de el buscador, como siempre.
            expect(badge.element.parentElement?.querySelector('button')?.textContent.trim()).toBe('Buscá dónde comer');
        });

        it('lo dice, y «Reintentar» los vuelve a pedir', async () => {
            const listImport = failListImport(1);
            const { panel, listButton } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });

            // El pedido que falla tarda lo que tardan los otros dos en bajar.
            await vi.waitFor(
                () => {
                    expect(panel().find('[data-panel-offline]').exists()).toBe(true);
                },
                { timeout: IMPORT_TIMEOUT },
            );
            const notice = panel().get('[data-panel-offline]');
            expect(notice.attributes('role')).toBe('alert');
            expect(notice.text()).toContain('Sin señal');

            await notice.get('button').trigger('click');
            await vi.waitFor(
                () => {
                    expect(listImport.calls).toBe(2);
                    expect(panel().find('[data-panel-offline]').exists()).toBe(false);
                },
                { timeout: IMPORT_TIMEOUT },
            );

            await listButton()?.trigger('click');
            await vi.waitFor(
                () => {
                    expect(panel().find('h2').text()).toBe('Restaurantes');
                },
                { timeout: IMPORT_TIMEOUT },
            );
        });

        it('El buscador de la bienvenida también los vuelve a pedir y abre la lista cuando llegan', async () => {
            const listImport = failListImport(1);
            const { panel, listButton } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
            await vi.waitFor(
                () => {
                    expect(panel().find('[data-panel-offline]').exists()).toBe(true);
                },
                { timeout: IMPORT_TIMEOUT },
            );

            await listButton()?.trigger('click');
            await vi.waitFor(
                () => {
                    expect(panel().find('h2').text()).toBe('Restaurantes');
                },
                { timeout: IMPORT_TIMEOUT },
            );

            expect(listImport.calls).toBe(2);
        });
    });

    describe('abierto con un restaurante en la dirección (?r=slug)', () => {
        it('cuando llega la lista, ese restaurante abre elegido: su resumen, su marca en el mapa y el foco en su nombre', async () => {
            const { layer, network, panel } = await mountHome({ url: '/?r=prueba-el-guadual' });
            expect(panel().find('[role="dialog"]').exists()).toBe(false);

            network.last()?.respond([LA_CEIBA, EL_GUADUAL]);
            await flushPromises();

            expect(panel().get('[role="dialog"] h2').text()).toBe('Restaurante de Prueba El Guadual (ficticio)');
            expect(layer().props('selected')).toBe('prueba-el-guadual');
            expect(document.activeElement).toBe(panel().get('h2').element);
        });

        it('la cámara va hasta él cuando el panel asomado termina de crecer', async () => {
            const home = await mountHome({ url: '/?r=prueba-el-guadual' });
            const { reveal, finish } = watchSheetMoves(home);

            home.network.last()?.respond([LA_CEIBA, EL_GUADUAL]);
            await flushPromises();
            expect(reveal).not.toHaveBeenCalled();

            await finish();
            expect(reveal).toHaveBeenCalledOnce();
        });

        it('al cerrarlo, el foco va al mapa: no se abrió desde la lista', async () => {
            const { map, panel, pressEscape } = await mountHome({ url: '/?r=prueba-la-ceiba', answer: [LA_CEIBA, EL_GUADUAL] });
            expect(panel().find('[role="dialog"]').exists()).toBe(true);

            await pressEscape();

            expect(panel().find('[role="dialog"]').exists()).toBe(false);
            expect(document.activeElement).toBe(map().element);
        });

        it('si ese restaurante no está en la lista, el inicio abre como siempre', async () => {
            const { layer, panel, status } = await mountHome({ url: '/?r=ya-no-esta', answer: [LA_CEIBA] });

            expect(panel().find('[role="dialog"]').exists()).toBe(false);
            expect(layer().props('selected')).toBeNull();
            expect(status().text()).toBe('1 restaurante en el mapa');
        });

        it('se elige una sola vez: cerrado el resumen, volver a pedir la lista no lo reabre', async () => {
            const { inertia, network, panel, pressEscape } = await mountHome({ url: '/?r=prueba-la-ceiba', answer: [LA_CEIBA] });
            await pressEscape();

            // Cambiar de idioma vuelve a pedir la lista.
            inertia.receiveFromServer('en', { replace: true });
            await flushPromises();
            network.last()?.respond([LA_CEIBA]);
            await flushPromises();

            expect(panel().find('[role="dialog"]').exists()).toBe(false);
        });

        it('si la lista falla y llega al reintentar, lo elige igual', async () => {
            const { network, panel } = await mountHome({ url: '/?r=prueba-la-ceiba' });
            network.last()?.fail();
            await flushPromises();

            await panel().get('[role="alert"] button').trigger('click');
            network.last()?.respond([LA_CEIBA]);
            await flushPromises();

            expect(panel().get('[role="dialog"] h2').text()).toBe('Restaurante de Prueba La Ceiba (ficticio)');
        });

        it('sin el parámetro no elige a nadie ni toca la dirección', async () => {
            const { layer, panel, replace } = await mountHome({ url: '/?lang=es', answer: [LA_CEIBA] });

            expect(panel().find('[role="dialog"]').exists()).toBe(false);
            expect(layer().props('selected')).toBeNull();
            expect(replace).not.toHaveBeenCalled();
        });

        // Queda en la dirección: «atrás» desde su ficha vuelve al mapa con él (#11).
        it('si el restaurante está en la lista, el parámetro se queda en la dirección', async () => {
            const { network, replace } = await mountHome({ url: '/?r=prueba-la-ceiba' });

            network.last()?.respond([LA_CEIBA, EL_GUADUAL]);
            await flushPromises();

            expect(replace).not.toHaveBeenCalled();
        });

        it('también sale si ese restaurante no está en la lista', async () => {
            const { replace } = await mountHome({ url: '/?r=ya-no-esta', answer: [LA_CEIBA] });

            expect(replace).toHaveBeenCalledExactlyOnceWith({ url: '/', preserveScroll: true, preserveState: true });
        });

        it('los demás parámetros de la dirección se quedan', async () => {
            const { replace } = await mountHome({ url: '/?lang=en&r=ya-no-esta', answer: [LA_CEIBA] });

            expect(replace).toHaveBeenCalledExactlyOnceWith({ url: '/?lang=en', preserveScroll: true, preserveState: true });
        });

        it('con la ruta pedida desde su ficha, abre también «Cómo llegar»', async () => {
            const { askDirections } = await import('@/routing/intent');
            askDirections('prueba-la-ceiba');
            const { panel } = await mountHome({ url: '/?r=prueba-la-ceiba', answer: [LA_CEIBA, EL_GUADUAL] });
            await vi.dynamicImportSettled();
            await flushPromises();

            expect(panel().find('[data-directions] h3').text()).toBe('Cómo llegar');
            expect(panel().get('[data-route-status]').text()).toBe('Buscando tu ubicación… Si te pregunta, tocá «Permitir».');
        });

        it('un enlace a /?r=slug sin pasar por la ficha abre el restaurante, sin pedir la ruta ni la ubicación', async () => {
            const { panel } = await mountHome({ url: '/?r=prueba-la-ceiba', answer: [LA_CEIBA] });
            await vi.dynamicImportSettled();

            expect(panel().find('[role="dialog"]').exists()).toBe(true);
            expect(panel().find('[data-route-status]').exists()).toBe(false);
            expect(panel().get('button[data-directions]').text()).toBe('Cómo llegar');
        });
    });

    describe('el restaurante elegido en la dirección', () => {
        it('elegirlo lo pone en la dirección, sin sumar una entrada al historial', async () => {
            const { replace, tapOnMap } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });

            await tapOnMap('prueba-el-guadual');

            expect(replace).toHaveBeenCalledExactlyOnceWith({ url: '/?r=prueba-el-guadual', preserveScroll: true, preserveState: true });
        });

        it('cerrarlo lo saca, y los demás parámetros se quedan', async () => {
            const { inertia, replace, tapOnMap, pressEscape } = await mountHome({ url: '/?lang=en', answer: [LA_CEIBA] });
            replace.mockImplementation(({ url }: { url: string }) => {
                inertia.page.url = url;
            });

            await tapOnMap('prueba-la-ceiba');
            await pressEscape();

            expect(replace.mock.calls).toEqual([
                [{ url: '/?lang=en&r=prueba-la-ceiba', preserveScroll: true, preserveState: true }],
                [{ url: '/?lang=en', preserveScroll: true, preserveState: true }],
            ]);
        });
    });

    describe('cómo llegar', () => {
        it('el resumen lo ofrece; al tocarlo, el panel de la ruta lo reemplaza y toma el foco', async () => {
            const { panel, tapOnMap } = await mountHome({ answer: [LA_CEIBA] });
            await tapOnMap('prueba-la-ceiba');

            await panel().get('button[data-directions]').trigger('click');
            await vi.dynamicImportSettled();
            await flushPromises();

            expect(panel().find('button[data-directions]').exists()).toBe(false);
            expect(document.activeElement).toBe(panel().get('[data-directions] h3').element);
            // Con la ruta el panel crece: se desplaza por dentro, sin pasar de su alto.
            expect(panel().get('[data-sheet-body]').classes()).toContain('overflow-y-auto');
            expect(panel().get('[data-google-maps]').attributes('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=4.4128%2C-76.1547&travelmode=walking');
        });

        it('si «Cómo llegar» no baja (sin señal), lo dice y «Volver a intentar» lo vuelve a pedir', async () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            // La capa de la ruta llega con import(): el primer pedido falla, como sin señal.
            const routeImport = { failures: 1, calls: 0 };
            vi.doMock('@/components/RouteLayer.vue', async (importOriginal) => {
                routeImport.calls += 1;

                if (routeImport.failures > 0) {
                    routeImport.failures -= 1;
                    throw new TypeError('Failed to fetch dynamically imported module');
                }

                return await importOriginal();
            });
            onTestFinished(() => {
                vi.doUnmock('@/components/RouteLayer.vue');
                errors.mockRestore();
            });
            const { panel, tapOnMap } = await mountHome({ answer: [LA_CEIBA] });
            await tapOnMap('prueba-la-ceiba');
            await panel().get('button[data-directions]').trigger('click');
            await vi.dynamicImportSettled();
            await flushPromises();

            expect(panel().get('[data-route-status]').text()).toContain('parece que estás sin señal');

            await panel().findAll('[data-directions] button').find((button) => button.text() === 'Volver a intentar')?.trigger('click');
            await vi.dynamicImportSettled();
            await flushPromises();

            // La capa de verdad trae al bajar el router y sus módulos: tarda un poco más.
            await vi.waitFor(() => {
                expect(panel().find('[data-directions] h3').exists()).toBe(true);
            });

            expect(routeImport.calls).toBe(2);
            expect(panel().get('[data-directions] h3').text()).toBe('Cómo llegar');
            expect(panel().get('[data-route-status]').text()).not.toContain('sin señal');
        });

        it('al ocultar la ruta vuelve el botón, con el foco', async () => {
            const { panel, tapOnMap } = await mountHome({ answer: [LA_CEIBA] });
            await tapOnMap('prueba-la-ceiba');
            await panel().get('button[data-directions]').trigger('click');
            await vi.dynamicImportSettled();
            await flushPromises();

            // El único botón de cerrar, en la línea del restaurante.
            await panel().get('button[data-close-directions]').trigger('click');
            await flushPromises();

            expect(document.activeElement).toBe(panel().get('button[data-directions]').element);
        });

        it('elegir otro restaurante cierra la ruta hasta el anterior', async () => {
            const { panel, tapOnMap } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
            await tapOnMap('prueba-la-ceiba');
            await panel().get('button[data-directions]').trigger('click');
            await vi.dynamicImportSettled();
            await flushPromises();

            await tapOnMap('prueba-el-guadual');

            expect(panel().find('[data-route-status]').exists()).toBe(false);
            expect(panel().find('button[data-directions]').exists()).toBe(true);
        });

        it('si el mapa no carga, lo dice y deja las otras apps', async () => {
            engine.fails = true;
            const { panel, tapOnMap } = await mountHome({ answer: [LA_CEIBA] });
            await tapOnMap('prueba-la-ceiba');
            await panel().get('button[data-directions]').trigger('click');
            await vi.dynamicImportSettled();
            await flushPromises();

            expect(panel().get('[data-route-status]').text()).toBe('Sin el mapa no podemos calcular la ruta aquí: abrila en Google Maps o Waze.');
            expect(panel().find('[data-waze]').exists()).toBe(true);
        });
    });

    describe('el resumen', () => {
        it('tocar un restaurante en el mapa abre su resumen, con el estado y el foco en su nombre', async () => {
            const { layer, openStatus, panel, tapOnMap } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });

            await tapOnMap('prueba-el-guadual');

            expect(panel().get('[role="dialog"] h2').text()).toBe('Restaurante de Prueba El Guadual (ficticio)');
            expect(openStatus()).toBe('Cerrado · abre a las 6:00 p. m.');
            expect(document.activeElement).toBe(panel().get('h2').element);
            // El mapa se entera de cuál es, para marcarlo.
            expect(layer().props('selected')).toBe('prueba-el-guadual');
        });

        it('elegirlo en la lista abre el mismo resumen', async () => {
            const { items, layer, openStatus, panel } = await mountWithList();

            await items()[0]?.trigger('click');
            await flushPromises();

            expect(panel().get('[role="dialog"] h2').text()).toBe('Restaurante de Prueba La Ceiba (ficticio)');
            expect(openStatus()).toBe('Abierto ahora · cierra a las 3:00 p. m.');
            expect(layer().props('selected')).toBe('prueba-la-ceiba');
        });

        it('cerrarlo, abierto desde la lista, vuelve a la lista con el foco en su botón', async () => {
            const { items, layer, panel } = await mountWithList();
            await items()[1]?.trigger('click');
            await flushPromises();

            await panel().get('button[aria-label="Cerrar el resumen"]').trigger('click');
            await flushPromises();

            expect(panel().find('[role="dialog"]').exists()).toBe(false);
            expect(document.activeElement).toBe(items()[1]?.element);
            expect(layer().props('selected')).toBeNull();
        });

        it('cerrarlo, abierto desde el mapa, devuelve el foco al mapa', async () => {
            const { map, panel, tapOnMap } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
            await tapOnMap('prueba-la-ceiba');

            await panel().get('button[aria-label="Cerrar el resumen"]').trigger('click');
            await flushPromises();

            expect(panel().find('[role="dialog"]').exists()).toBe(false);
            expect(document.activeElement).toBe(map().element);
        });

        it('Escape cierra primero el resumen y después la lista', async () => {
            const { items, panel, pressEscape } = await mountWithList();
            await items()[0]?.trigger('click');
            await flushPromises();

            await pressEscape();

            expect(panel().find('[role="dialog"]').exists()).toBe(false);
            expect(items()).toHaveLength(2);

            await pressEscape();

            expect(items()).toHaveLength(0);
        });

        it('tocar otro restaurante cambia el resumen', async () => {
            const { panel, tapOnMap } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
            await tapOnMap('prueba-la-ceiba');

            await tapOnMap('prueba-el-guadual');

            expect(panel().findAll('[role="dialog"]')).toHaveLength(1);
            expect(panel().get('[role="dialog"] h2').text()).toBe('Restaurante de Prueba El Guadual (ficticio)');
        });

        it('tocado en el mapa, cuando el panel termina de subir, la cámara lo saca de debajo del panel', async () => {
            const home = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
            const { reveal, finish } = watchSheetMoves(home);

            await home.tapOnMap('prueba-el-guadual');
            // El panel recién empieza a subir: medirlo ahora sería medir el asomado.
            expect(reveal).not.toHaveBeenCalled();

            await finish();
            expect(reveal).toHaveBeenCalledOnce();
        });

        it('elegido en la lista abierta completa, la cámara espera a que el panel baje a media altura', async () => {
            const home = await mountWithList();
            await home.wrapper.get('[data-sheet-handle]').trigger('keydown', { key: 'End' });
            const { reveal, finish } = watchSheetMoves(home);

            await home.items()[1]?.trigger('click');
            await flushPromises();
            expect(reveal).not.toHaveBeenCalled();

            await finish();
            expect(reveal).toHaveBeenCalledOnce();
        });

        it('tocar otro sin que el panel cambie de alto lo deja a la vista enseguida', async () => {
            const home = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
            await home.tapOnMap('prueba-la-ceiba');
            const { reveal } = watchSheetMoves(home);

            await home.tapOnMap('prueba-el-guadual');

            expect(reveal).toHaveBeenCalledOnce();
        });

        it('enlaza a la ficha del restaurante elegido', async () => {
            const { panel, tapOnMap } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });

            await tapOnMap('prueba-el-guadual');

            expect(panel().get('[role="dialog"] a').attributes('href')).toBe('/restaurants/prueba-el-guadual');
        });

        it('al cambiar de idioma sigue abierto, con las categorías en el idioma nuevo', async () => {
            const { inertia, network, openStatus, panel, tapOnMap } = await mountHome();
            network.last()?.respond([LA_CEIBA]);
            await flushPromises();
            await tapOnMap('prueba-la-ceiba');

            inertia.receiveFromServer('en', { replace: true });
            await flushPromises();
            network.last()?.respond([restaurant({ categories: [{ slug: 'comida-tipica', name: 'Traditional food' }] })]);
            await flushPromises();

            expect(network.urls()).toEqual(['/api/restaurants.geojson?lang=es', '/api/restaurants.geojson?lang=en']);
            expect(panel().get('[role="dialog"] li').text()).toBe('Traditional food');
            expect(openStatus()).toBe('Open now · closes at 3:00 PM');
        });

        it('si al volver a pedir la lista el elegido ya no está, su resumen se cierra', async () => {
            const { inertia, layer, network, panel, status, tapOnMap } = await mountHome();
            network.last()?.respond([LA_CEIBA, EL_GUADUAL]);
            await flushPromises();
            await tapOnMap('prueba-la-ceiba');

            inertia.receiveFromServer('en', { replace: true });
            await flushPromises();
            network.last()?.respond([EL_GUADUAL]);
            await flushPromises();

            expect(panel().find('[role="dialog"]').exists()).toBe(false);
            expect(status().text()).toBe('1 restaurant on the map');
            expect(layer().props('selected')).toBeNull();
        });
    });
    describe('búsqueda, filtros, almuerzos y «Sugerime algo» (#12)', () => {
        /** Lo que tarda la dirección en seguir a los filtros después de teclear. */
        const settleUrl = async () => {
            await new Promise((resolve) => setTimeout(resolve, 350));
            await flushPromises();
        };

        it('los filtros de la dirección llegan a la capa y a la lista', async () => {
            const { layer, listButton, items } = await mountHome({ url: '/?delivery=1&q=ceiba', answer: [LA_CEIBA, EL_GUADUAL] });

            expect(layer().props('filters')).toEqual({ ...NO_FILTERS, delivery: true, query: 'ceiba' });

            await listButton()?.trigger('click');
            await flushPromises();

            expect(items().map((item) => item.attributes('data-slug'))).toEqual(['prueba-la-ceiba']);
        });

        it('al filtrar en la lista, cambian la capa, el contador y la dirección, sin la ubicación', async () => {
            const { layer, panel, replace, wrapper } = await mountWithList();

            // «¿Dónde estoy?» encendido: la lista ya tiene las distancias (con metros fáciles de reconocer).
            // (El primero con ese nombre es el envoltorio del inicio, sin instancia: se avisa desde el de verdad.)
            const distances = wrapper.findAllComponents({ name: 'RestaurantDistances' }).find((component) => component.vm !== undefined);
            (distances?.vm as unknown as { $emit: (event: 'distances', meters: Record<string, number>) => void }).$emit('distances', {
                'prueba-la-ceiba': 4730,
                'prueba-el-guadual': 8160,
            });
            await flushPromises();
            expect(panel().findAll('[data-distance]').map((distance) => distance.text().replaceAll(' ', ' '))).toEqual(['4,7 km', '8,2 km']);

            await panel().get('input[data-search]').setValue('guadual');
            await flushPromises();

            expect(layer().props('filters')).toMatchObject({ query: 'guadual' });
            expect(wrapper.findAll('button[data-slug]').map((item) => item.attributes('data-slug'))).toEqual(['prueba-el-guadual']);
            expect(panel().get('[data-count]').text()).toBe('1 de 2 restaurantes');

            await settleUrl();

            expect(replace).toHaveBeenLastCalledWith(expect.objectContaining({ url: '/?q=guadual' }));
            // Ninguna dirección lleva coordenadas ni metros: solo lo que se eligió en la pantalla.
            for (const [{ url }] of replace.mock.calls as [{ url: string }][]) {
                expect([...new URL(url, 'https://veni.test').searchParams.keys()]).toEqual(['q']);
                expect(url).not.toMatch(/4730|8160|4\.4\d|76\.1/);
            }
        });

        it('tres teclas seguidas dan un solo cambio de la dirección', async () => {
            const { panel, replace } = await mountWithList();
            replace.mockClear();

            for (const query of ['g', 'gu', 'gua']) {
                await panel().get('input[data-search]').setValue(query);
            }

            await settleUrl();

            expect(replace).toHaveBeenCalledOnce();
            expect(replace).toHaveBeenCalledWith(expect.objectContaining({ url: '/?q=gua' }));
        });

        it('abrir con una búsqueda en la dirección («Buscar dónde lo sirven», de la guía de platos) abre la lista y busca el plato (#21)', async () => {
            const { network, panel } = await mountHome({ url: '/?q=sancocho', answer: [LA_CEIBA, EL_GUADUAL] });

            expect(panel().get<HTMLInputElement>('input[data-search]').element.value).toBe('sancocho');

            // La sección «Platos» (#17) pide la búsqueda cuando se deja de teclear.
            await new Promise((resolve) => setTimeout(resolve, 400));
            await flushPromises();

            const dishSearches = network.fetchMock.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/dishes/search?'));
            expect(dishSearches).toHaveLength(1);
            expect(new URL(dishSearches[0] ?? '', 'https://veni.test').searchParams.get('q')).toBe('sancocho');
        });

        it('la lista que abrió la dirección se abre una sola vez: al cerrarla queda la bienvenida, con la búsqueda puesta', async () => {
            const { layer, listButton, panel, pressEscape } = await mountHome({ url: '/?q=sancocho', answer: [LA_CEIBA, EL_GUADUAL] });

            await pressEscape();

            expect(listButton()).toBeDefined();
            expect(panel().find('input[data-search]').exists()).toBe(false);
            expect(layer().props('filters')).toEqual({ ...NO_FILTERS, query: 'sancocho' });
        });

        it('sin búsqueda ni filtros en la dirección, el inicio abre con la bienvenida', async () => {
            const { listButton, panel } = await mountHome({ url: '/?lang=es', answer: [LA_CEIBA, EL_GUADUAL] });

            expect(listButton()).toBeDefined();
            expect(panel().find('input[data-search]').exists()).toBe(false);
        });

        it('con la búsqueda en la dirección, la lista se abre enseguida con sus siluetas mientras llegan los restaurantes (#138, A5)', async () => {
            const { network, panel } = await mountHome({ url: '/?q=sancocho' });

            // Ni el mapa sin marcadores con el panel asomado ni un texto de «cargando» a la vista.
            expect(panel().find('input[data-search]').exists()).toBe(false);
            expect(panel().attributes('data-sheet')).toBe('full');
            expect(panel().findAll('[data-list-loading] [data-skeleton]')).toHaveLength(5);
            expect(panel().get('[data-list-loading] ul').attributes('aria-hidden')).toBe('true');
            expect(panel().get('[data-list-loading] [role="status"]').text()).toBe('Cargando los restaurantes…');
            expect(panel().find('button[data-suggest]').exists()).toBe(false);

            network.requests[0]?.respond([LA_CEIBA, EL_GUADUAL]);
            await flushPromises();

            expect(panel().find('[data-list-loading]').exists()).toBe(false);
            expect(panel().get<HTMLInputElement>('input[data-search]').element.value).toBe('sancocho');
            expect(panel().attributes('data-sheet')).toBe('full');
        });

        it('si los restaurantes no llegan, las siluetas dejan lugar al aviso con «Reintentar»', async () => {
            const { network, panel } = await mountHome({ url: '/?q=sancocho' });

            network.requests[0]?.fail();
            await flushPromises();

            expect(panel().find('[data-list-loading]').exists()).toBe(false);
            expect(panel().get('[role="alert"]').text()).toContain('Reintentar');
            expect(panel().attributes('data-sheet')).toBe('half');
        });

        it('cerrada antes de que baje la lista, la que abrió la dirección no se vuelve a abrir al llegar los restaurantes', async () => {
            const { network, panel } = await mountHome({
                url: '/?q=sancocho',
                beforeChunks: () => {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
                },
            });

            network.requests[0]?.respond([LA_CEIBA, EL_GUADUAL]);
            await flushPromises();

            expect(panel().find('input[data-search]').exists()).toBe(false);
            expect(panel().find('button[data-suggest]').exists()).toBe(true);
            expect(panel().attributes('data-sheet')).toBe('peek');
        });

        it('con la búsqueda en la dirección y ningún restaurante, el aviso queda a media altura', async () => {
            const { network, panel } = await mountHome({ url: '/?q=sancocho' });

            network.requests[0]?.respond([]);
            await flushPromises();

            expect(panel().find('[data-list-loading]').exists()).toBe(false);
            expect(panel().find('input[data-search]').exists()).toBe(false);
            expect(panel().text()).toContain('Todavía no hay restaurantes');
            expect(panel().attributes('data-sheet')).toBe('half');
        });

        it('sin búsqueda en la dirección no hay siluetas: la bienvenida dice que carga', async () => {
            const { panel } = await mountHome({ url: '/' });

            expect(panel().find('[data-list-loading]').exists()).toBe(false);
            expect(panel().attributes('data-sheet')).toBe('peek');
        });

        it.each(['/?price=2', '/?category=Mala_Categoria', '/?open=10', '/?q=+'])('%s no es un filtro: ni siluetas ni la lista', async (url) => {
            const { panel } = await mountHome({ url });

            expect(panel().find('[data-list-loading]').exists()).toBe(false);
            expect(panel().attributes('data-sheet')).toBe('peek');
        });

        it('abrir con una búsqueda en la dirección no la vuelve a escribir: «%20» y «+» son el mismo espacio', async () => {
            const { replace, layer } = await mountHome({ url: '/?q=la%20ceiba', answer: [LA_CEIBA, EL_GUADUAL] });
            await settleUrl();

            expect(layer().props('filters')).toEqual({ ...NO_FILTERS, query: 'la ceiba' });
            expect(replace).not.toHaveBeenCalled();
        });

        it('una categoría de la dirección que ningún restaurante tiene se descarta: la lista y el mapa los muestran todos', async () => {
            const { layer, listButton, items, replace } = await mountHome({ url: '/?category=no-existe&delivery=1', answer: [LA_CEIBA, EL_GUADUAL] });
            await settleUrl();

            expect(layer().props('filters')).toEqual({ ...NO_FILTERS, delivery: true });
            expect(replace).toHaveBeenLastCalledWith(expect.objectContaining({ url: '/?delivery=1' }));

            await listButton()?.trigger('click');
            await flushPromises();

            expect(items().map((item) => item.attributes('data-slug'))).toEqual(['prueba-la-ceiba']);
        });

        it('Escape en el buscador con texto lo vacía y deja la lista abierta; vacío, la cierra', async () => {
            const { panel, items, layer } = await mountWithList();
            const search = panel().get('input[data-search]');
            await search.setValue('guadual');
            await flushPromises();

            search.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            await flushPromises();

            expect(layer().props('filters')).toEqual(NO_FILTERS);
            expect(items()).toHaveLength(2);

            panel().get('input[data-search]').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            await flushPromises();

            expect(items()).toHaveLength(0);
        });

        it('sin resultados lo dice, y «Quitar filtros» los saca de la lista, del mapa y de la dirección', async () => {
            const { layer, panel, replace } = await mountHome({ url: '/?r=x', answer: [LA_CEIBA, EL_GUADUAL] });
            await panel().findAll('button').find((button) => button.text() === 'Buscá dónde comer')?.trigger('click');
            await flushPromises();

            await panel().get('input[data-search]').setValue('no existe');
            await flushPromises();

            expect(panel().get('[data-count]').text()).toBe('Ningún restaurante cumple con lo que buscás. Probá con menos filtros.');

            await panel().get('button[data-empty-clear]').trigger('click');
            await flushPromises();
            await settleUrl();

            expect(layer().props('filters')).toEqual(NO_FILTERS);
            expect(panel().findAll('button[data-slug]')).toHaveLength(2);
            expect(replace).toHaveBeenLastCalledWith(expect.objectContaining({ url: '/' }));
        });

        it('«Sugerime algo» elige uno de los abiertos y abre su resumen', async () => {
            // A las 12:30 La Ceiba (11–15) está abierta y El Guadual (18–02), cerrado.
            const { panel, layer } = await mountHome({ answer: [EL_GUADUAL, LA_CEIBA] });

            await panel().get('button[data-suggest]').trigger('click');
            await flushPromises();

            expect(layer().props('selected')).toBe('prueba-la-ceiba');
            expect(panel().find('h2').text()).toBe(LA_CEIBA.name);
        });

        it('«Sugerime algo» sin abiertos lo dice y no elige ninguno', async () => {
            const { panel, layer } = await mountHome({ answer: [EL_GUADUAL] });

            await panel().get('button[data-suggest]').trigger('click');
            await flushPromises();

            expect(layer().props('selected')).toBeNull();
            // En pantalla (#138, A1): el panel sube de asomado a media altura, con el que abre primero.
            expect(panel().get('[data-welcome-status]').text()).toBe('Ahora no hay ningún restaurante abierto. El que abre primero es Restaurante de Prueba El Guadual (ficticio), abre a las 6:00 p. m.');
            expect(panel().attributes('data-sheet')).toBe('half');

            await panel().get('button[data-suggest-next]').trigger('click');
            await flushPromises();
            expect(layer().props('selected')).toBe('prueba-el-guadual');
        });

        it('«Almuerzos de hoy» abre la lista en esa sección, con el foco ahí', async () => {
            const lunch = { date: '2026-10-07', description: 'Almuerzo de prueba: sopa y seco.', price: 14000 };
            const { panel } = await mountHome({ answer: [restaurant({ lunch }), EL_GUADUAL] });

            const button = panel().get('button[data-lunches]');
            expect(button.text()).toBe('Almuerzos de hoy (1)');

            await button.trigger('click');
            await flushPromises();

            const lunches = panel().get('details[data-lunches]');
            expect(lunches.attributes('open')).toBeDefined();
            expect(document.activeElement).toBe(lunches.get('summary').element);
            expect(lunches.get('a[data-lunch]').attributes('href')).toBe('/restaurants/prueba-la-ceiba');
            expect(lunches.get('[data-price]').text().replaceAll(' ', ' ')).toBe('$ 14.000');
        });
    });
});

describe('Home con la barra de pestañas (#139, ADR 0041)', () => {
    afterEach(async () => {
        const { resetHomeList } = await import('@/navigation/tabs');
        resetHomeList();
    });

    it('«Lista» abre la lista a la altura completa, y «Mapa» la cierra', async () => {
        const { showHomeList } = await import('@/navigation/tabs');
        const { panel, items } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });

        showHomeList('heading');
        await flushPromises();
        expect(panel().attributes('data-sheet')).toBe('full');
        expect(items()).toHaveLength(2);

        showHomeList(false);
        await flushPromises();
        expect(items()).toHaveLength(0);
        expect(panel().attributes('data-sheet')).toBe('peek');
    });

    it('abrir la lista desde el panel la marca en la barra; cerrarla, también', async () => {
        const { homeList } = await import('@/navigation/tabs');
        const { listButton, panel } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });

        await listButton()?.trigger('click');
        await flushPromises();
        expect(homeList.value).toBe('search');

        await panel().get('button[aria-label="Cerrar la lista"]').trigger('click');
        expect(homeList.value).toBe(false);
    });

    it('con un elegido, «Lista» cierra su resumen y muestra la lista', async () => {
        const { showHomeList } = await import('@/navigation/tabs');
        const { panel, tapOnMap, items } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        await tapOnMap(LA_CEIBA.slug);
        expect(panel().find('[role="dialog"]').exists()).toBe(true);

        showHomeList('heading');
        await flushPromises();
        expect(panel().find('[role="dialog"]').exists()).toBe(false);
        expect(items()).toHaveLength(2);
    });

    it('buscar con la lista abierta lleva el foco al buscador', async () => {
        const { showHomeList } = await import('@/navigation/tabs');
        const { panel } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        showHomeList('heading');
        await flushPromises();

        showHomeList('search');
        await flushPromises();
        expect(document.activeElement).toBe(panel().get('input[type="search"]').element);
    });

    it('«Lista» con la lista ya abierta y un elegido de ella vuelve a la lista (BUG-049)', async () => {
        const { showHomeList } = await import('@/navigation/tabs');
        const { panel, items } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        showHomeList('heading');
        await flushPromises();
        await items()[1]?.trigger('click');
        await flushPromises();
        expect(panel().find('[role="dialog"]').exists()).toBe(true);

        showHomeList('heading');
        await flushPromises();
        expect(panel().find('[role="dialog"]').exists()).toBe(false);
        expect(items()).toHaveLength(2);
    });

    it('«Lista» muestra la lista a pantalla completa: el panel de abajo con la lista, con lo de arriba fijo, sin desmontar el mapa', async () => {
        const { showHomeList } = await import('@/navigation/tabs');
        const { panel, map } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        const mapView = map().element;

        showHomeList('heading');
        await flushPromises();
        // Lo que reconoce la regla de TabBar.vue: el panel de abajo (`data-sheet`) con la lista adentro.
        expect(panel().attributes('data-sheet')).toBeDefined();
        expect(panel().find('[data-sheet-body] > [data-full-list]').exists()).toBe(true);
        expect(panel().get('[data-full-list] h2').text()).toBe('Restaurantes');
        // El buscador, los filtros en píldoras y cuántos hay van juntos arriba; las filas, después.
        const head = panel().get('[data-list-head]');
        expect(head.find('input[type="search"]').exists()).toBe(true);
        expect(head.find('[data-count]').text()).toBe('2 restaurantes en el mapa');
        expect(head.find('button[data-slug]').exists()).toBe(false);

        showHomeList(false);
        await flushPromises();
        expect(panel().find('[data-full-list]').exists()).toBe(false);
        // El mismo mapa: no se desmontó ni volvió a pedir sus teselas.
        expect(map().element).toBe(mapView);
    });

    it('la pantalla completa la dice el CSS de la barra (fuera del arranque): de borde a borde, sobre la barra, sin manija y con el mapa oculto', () => {
        const css = readFileSync('resources/js/components/TabBar.vue', 'utf8');
        const full = ':global([data-sheet]:has(> [data-sheet-body] > :is([data-full-list], [data-list-loading]))';

        expect(css).toContain(`${full}) {`);
        expect(css).toMatch(/inset: 0;\s*z-index: 20;\s*max-height: 100%;\s*padding: env\(safe-area-inset-top\) env\(safe-area-inset-right\) var\(--veni-tabbar-space\) env\(safe-area-inset-left\);/);
        expect(css).toContain(`${full} > [data-sheet-handle]) {
    display: none;`);
        expect(css).toContain(`${full} ~ *) {
    visibility: hidden;`);
    });

    it('a pantalla completa solo en el celular: en computador la lista va en la barra lateral, sin panel de abajo (ADR 0037)', async () => {
        const media = stubMedia(phoneWidth);
        const { showHomeList } = await import('@/navigation/tabs');
        const { panel } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        showHomeList('heading');
        await flushPromises();
        expect(panel().find('[data-full-list]').exists()).toBe(true);

        media.change(desktopWidth);
        await vi.dynamicImportSettled();
        await flushPromises();
        expect(panel().attributes('data-sheet')).toBeUndefined();
        expect(panel().find('[data-full-list]').exists()).toBe(false);

        media.change(phoneWidth);
        await flushPromises();
        expect(panel().find('[data-sheet-body] > [data-full-list]').exists()).toBe(true);
    });

    it('ida y vuelta entre «Mapa» y «Lista» conserva la búsqueda y los filtros, y el foco vuelve al título de la lista', async () => {
        const { showHomeList } = await import('@/navigation/tabs');
        const { panel, items, layer } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        showHomeList('heading');
        await flushPromises();
        await panel().get('input[data-search]').setValue('guadual');
        await panel().get('input[data-filter="delivery"]').setValue(true);
        await flushPromises();
        expect(layer().props('filters')).toMatchObject({ query: 'guadual', delivery: true });

        showHomeList(false);
        await flushPromises();
        expect(items()).toHaveLength(0);
        // En el mapa siguen los filtros.
        expect(layer().props('filters')).toMatchObject({ query: 'guadual', delivery: true });

        showHomeList('heading');
        await flushPromises();
        expect((panel().get('input[data-search]').element as HTMLInputElement).value).toBe('guadual');
        expect((panel().get('input[data-filter="delivery"]').element as HTMLInputElement).checked).toBe(true);
        expect(document.activeElement).toBe(panel().get('[data-full-list] h2').element);
    });

    it('elegir desde la lista a pantalla completa vuelve al mapa con su resumen y el marcador elegido; al cerrarlo, la lista vuelve con el foco en su fila', async () => {
        const { showHomeList } = await import('@/navigation/tabs');
        const { panel, items, layer, pressEscape } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        showHomeList('heading');
        await flushPromises();
        const slug = items()[1]?.attributes('data-slug');

        await items()[1]?.trigger('click');
        await flushPromises();
        expect(panel().find('[data-full-list]').exists()).toBe(false);
        expect(panel().find('[role="dialog"]').exists()).toBe(true);
        expect(panel().attributes('data-sheet')).toBe('half');
        expect(layer().props('selected')).toBe(slug);

        await pressEscape();
        expect(panel().find('[data-full-list]').exists()).toBe(true);
        expect(document.activeElement?.getAttribute('data-slug')).toBe(slug);
    });

    it('le pasa a la barra la lista publicada, para que «Pedido» no ofrezca uno que ya no está (BUG-051)', async () => {
        const { published } = await import('@/navigation/tabs');
        await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });

        expect(published.value?.map(({ slug }) => slug)).toEqual([LA_CEIBA.slug, EL_GUADUAL.slug]);
    });

    it('buscar dos veces lleva el foco al buscador las dos veces (BUG-049)', async () => {
        const { showHomeList } = await import('@/navigation/tabs');
        const { panel } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        const search = () => panel().get('input[type="search"]').element;

        showHomeList('search');
        await flushPromises();
        expect(document.activeElement).toBe(search());

        (search() as HTMLInputElement).blur();
        showHomeList('search');
        await flushPromises();
        expect(document.activeElement).toBe(search());
    });

    it('pedida desde otra página, la lista abre al montarse, completa; al irse, la barra vuelve a «Mapa»', async () => {
        const { homeList } = await import('@/navigation/tabs');
        homeList.value = 'heading';
        const { panel, items, wrapper } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });

        expect(panel().attributes('data-sheet')).toBe('full');
        expect(items()).toHaveLength(2);

        wrapper.unmount();
        expect(homeList.value).toBe(false);
    });

    it('«Ajustes», dentro del layout, lleva el selector de idioma y el modo oscuro de verdad (EVA-070)', async () => {
        const { wrapper } = await mountHome({ answer: [LA_CEIBA], inLayout: true });
        const settings = wrapper.get('main [data-settings]');

        expect(settings.get('h2').text()).toBe('Ajustes');
        expect(settings.get('[role="group"]').attributes('aria-label')).toBe('Idioma (Language)');
        expect(settings.find('button[aria-label="Modo oscuro"]').exists()).toBe(true);
        // Son los mismos de la cabecera (que en el celular no se ve con el mapa), no copias a medias.
        expect(wrapper.findAll('button[aria-label="Modo oscuro"]')).toHaveLength(2);
    });

    it('el panel es sólido y deja libre la franja de la atribución, que en el celular suma la barra', async () => {
        const { panel } = await mountHome();

        expect(panel().classes()).toContain('bg-canvas');
        expect(panel().classes().some((name) => name.startsWith('bg-canvas/'))).toBe(false);
    });
});

/*
| En computador (desde 1024 px, ADR 0037): barra lateral fija con la lista
| siempre abierta y el mapa al lado. matchMedia dice que sí, y la prueba
| puede cambiar el ancho en caliente (testing/media.ts).
*/
describe('Home en computador', () => {
    let media: ReturnType<typeof stubMedia>;

    beforeEach(() => {
        media = stubMedia(desktopWidth);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    /** Cambia el ancho de la ventana y espera a que el inicio se acomode. */
    async function resize(width: (query: string) => boolean) {
        media.change(width);
        await vi.dynamicImportSettled();
        await flushPromises();
    }

    const activeIn = (element: Element) => element.contains(document.activeElement) && document.activeElement !== document.body;

    it('el panel es una barra fija con nombre (una región), antes del mapa, y el mapa ocupa el resto sin nada encima', async () => {
        const { wrapper, panel, map } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });

        expect(panel().attributes('role')).toBe('region');
        expect(panel().attributes('aria-label')).toBe('Dónde comer');
        expect(panel().classes()).toEqual(expect.arrayContaining(['max-w-sm', 'shrink-0']));
        expect(panel().classes()).not.toContain('absolute');
        // Sin manija ni alturas: no flota.
        expect(panel().find('[data-sheet-handle]').exists()).toBe(false);
        expect(panel().attributes('data-sheet')).toBeUndefined();
        expect(wrapper.get('inertia-head + div').classes()).toContain('flex');
        expect(wrapper.getComponent({ name: 'MapView' }).props('overlay')).toBeNull();
        // El foco recorre la barra antes que el mapa.
        expect(panel().element.compareDocumentPosition(map().element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('muestra el título, el subtítulo y la lista con el buscador, sin «Ver la lista» y sin llevarse el foco', async () => {
        const { wrapper, panel, listButton, items } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });

        expect(wrapper.get('h1').text()).toBe('Vení, comamos en Roldanillo');
        expect(wrapper.get('h1').classes()).not.toContain('sr-only');
        expect(panel().text()).toContain('Mirá los menús con precios y horarios');
        expect(listButton()).toBeUndefined();
        expect(panel().find('input').exists()).toBe(true);
        expect(items()).toHaveLength(2);
        expect(panel().find('[data-suggest]').exists()).toBe(true);
        expect(document.activeElement).toBe(document.body);
    });

    it('arriba, fijos, el título, el subtítulo, el buscador, «Sugerime algo» y el botón de los filtros; en el medio, lo único que se desplaza (con el panel de los filtros); abajo, la línea chica', async () => {
        const { panel } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        const before = (first: string, second: string) =>
            Boolean(panel().get(first).element.compareDocumentPosition(panel().get(second).element) & Node.DOCUMENT_POSITION_FOLLOWING);

        expect(before('h1', 'h2')).toBe(true);
        expect(before('h2', 'input[type="search"]')).toBe(true);
        expect(panel().get('h2').text()).toBe('Restaurantes');

        // Lo que se desplaza: el panel de los filtros, los almuerzos, las filas y lo guardado. El buscador, «Sugerime algo», el botón de los filtros y el pie, no.
        const scroller = panel().get('[data-list-scroll]');
        expect(scroller.classes()).toEqual(expect.arrayContaining(['min-h-0', 'flex-1', 'overflow-y-auto']));
        expect(scroller.findAll('button[data-slug]')).toHaveLength(2);
        expect(scroller.find('details[data-lunches]').exists()).toBe(true);
        for (const fixed of ['input[type="search"]', '[data-suggest]', '[data-filters-toggle]', '[data-sidebar-footer]']) {
            expect(scroller.element.contains(panel().get(fixed).element)).toBe(false);
        }
        // El panel de los filtros (#130): al principio de lo que se desplaza, no en lo fijo.
        expect(scroller.element.firstElementChild).toBe(panel().get('[data-filters-panel]').element);
        // La lista se lleva el alto que sobra: el pie queda abajo.
        expect(panel().get('section[aria-labelledby]').classes()).toEqual(expect.arrayContaining(['min-h-0', 'flex-1']));

        const footer = panel().get('[data-sidebar-footer]');
        expect(footer.element.parentElement?.lastElementChild).toBe(footer.element);
        expect(footer.classes()).toEqual(expect.arrayContaining(['text-xs', 'shrink-0', 'mt-auto']));
        expect(footer.findAll('a').map((link) => link.attributes('href'))).toEqual(['/credits', '/privacy', '/terms']);
        expect(footer.get('[data-credits]').text()).toBe('Créditos');
        expect(footer.get('[data-credits]').attributes('aria-label')).toBe('Créditos y datos de OpenStreetMap');
        // La guía de platos va solo en la navegación de la cabecera (#130): ni tarjeta ni enlace en la barra.
        expect(panel().find('a[href="/dishes"]').exists()).toBe(false);
    });

    it('abierto con un filtro en la dirección (?open=1), el panel de los filtros empieza abierto y el botón lo cuenta (#130)', async () => {
        const { panel } = await mountHome({ url: '/?open=1', answer: [LA_CEIBA, EL_GUADUAL] });
        const toggle = panel().get('button[data-filters-toggle]');

        expect(toggle.text()).toBe('Filtros (1)');
        expect(toggle.attributes('aria-expanded')).toBe('true');
        expect(panel().get<HTMLElement>('[data-filters-panel]').element.hidden).toBe(false);
        expect(panel().get<HTMLInputElement>('[data-filters-panel] [data-filter="open"]').element.checked).toBe(true);
    });

    it('con unos 40 restaurantes, la lista los trae todos dentro de la parte que se desplaza', async () => {
        const many = Array.from({ length: 40 }, (_, index) => restaurant({ slug: `prueba-${String(index)}`, name: `Restaurante de Prueba ${String(index)} (ficticio)` }));
        const { panel } = await mountHome({ answer: many });

        expect(panel().get('[data-list-scroll]').findAll('button[data-slug]')).toHaveLength(40);
        expect(panel().get('[data-sidebar-footer]').element.closest('[data-list-scroll]')).toBeNull();
    });

    it('tocar un marcador marca su fila en la lista y abre su resumen debajo; elegir en la lista lo elige en el mapa', async () => {
        const { tapOnMap, layer, items, wrapper } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });

        await tapOnMap(EL_GUADUAL.slug);
        const row = wrapper.get(`li[data-row="${EL_GUADUAL.slug}"]`);
        expect(row.get(`button[data-slug="${EL_GUADUAL.slug}"]`).attributes('aria-current')).toBe('true');
        expect(row.get('[role="dialog"]').text()).toContain(EL_GUADUAL.name);
        expect(layer().props('selected')).toBe(EL_GUADUAL.slug);

        await items().find((item) => item.attributes('data-slug') === LA_CEIBA.slug)?.trigger('click');
        await flushPromises();
        expect(layer().props('selected')).toBe(LA_CEIBA.slug);
        expect(wrapper.findAll('[role="dialog"]')).toHaveLength(1);
        expect(wrapper.find(`li[data-row="${LA_CEIBA.slug}"] [role="dialog"]`).exists()).toBe(true);
    });

    it('debajo de su fila, el resumen no repite el nombre ni el estado a la vista: quedan para el lector, con el foco en su encabezado', async () => {
        const { items, wrapper } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });

        await items()[0]?.trigger('click');
        await flushPromises();
        const dialog = wrapper.get(`li[data-row="${LA_CEIBA.slug}"] [role="dialog"]`);

        expect(dialog.get('h2').text()).toBe(LA_CEIBA.name);
        expect(dialog.get('h2').classes()).toContain('sr-only');
        expect(dialog.get('[data-status]').classes()).toContain('sr-only');
        expect(document.activeElement).toBe(dialog.get('h2').element);
    });

    it('con un elegido, escribir en el buscador o cambiar un filtro no le quita el foco al campo (el resumen real cambia de lugar)', async () => {
        const { tapOnMap, panel, wrapper } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        await tapOnMap(EL_GUADUAL.slug);

        const search = panel().get('input[type="search"]');
        (search.element as HTMLInputElement).focus();
        await search.setValue('ceiba');
        await flushPromises();
        // El Guadual ya no está entre las filas: su resumen sube arriba de la lista.
        expect(wrapper.find('[data-selected-outside] [role="dialog"]').exists()).toBe(true);
        expect(document.activeElement).toBe(search.element);

        await search.setValue('');
        await flushPromises();
        expect(wrapper.find(`li[data-row="${EL_GUADUAL.slug}"] [role="dialog"]`).exists()).toBe(true);
        expect(document.activeElement).toBe(search.element);

        const open = panel().get('input[data-filter="open"]');
        (open.element as HTMLInputElement).focus();
        await open.setValue(true);
        await flushPromises();
        expect(wrapper.find('[data-selected-outside] [role="dialog"]').exists()).toBe(true);
        expect(document.activeElement).toBe(open.element);
    });

    it('cerrar el resumen devuelve el foco a la fila; Escape no cierra la lista', async () => {
        const { items, pressEscape, wrapper } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });

        await items()[0]?.trigger('click');
        await flushPromises();
        const slug = items()[0]?.attributes('data-slug');
        await pressEscape();

        expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
        expect((document.activeElement as HTMLElement | null)?.dataset.slug).toBe(slug);

        await pressEscape();
        expect(items()).toHaveLength(2);
    });

    it('Escape no cierra la lista que venía abierta del celular: al volver al celular sigue abierta', async () => {
        media.change(phoneWidth);
        const { listButton, items, pressEscape, panel } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        await listButton()?.trigger('click');
        await flushPromises();
        expect(panel().find('button[aria-label="Cerrar la lista"]').exists()).toBe(true);

        await resize(desktopWidth);
        await pressEscape();
        expect(items()).toHaveLength(2);

        await resize(phoneWidth);
        expect(panel().find('button[aria-label="Cerrar la lista"]').exists()).toBe(true);
        expect(items()).toHaveLength(2);
    });

    it('al pasar al celular en caliente, con un elegido y un filtro: siguen los dos, el resumen abre y el foco no cae en <body>', async () => {
        const { items, layer, panel, wrapper, pressEscape } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        await items()[0]?.trigger('click');
        await flushPromises();
        const open = panel().get('input[data-filter="delivery"]');
        (open.element as HTMLInputElement).focus();
        await open.setValue(true);
        await flushPromises();

        await resize(phoneWidth);

        expect(panel().attributes('role')).toBeUndefined();
        expect(layer().props('selected')).toBe(LA_CEIBA.slug);
        expect(layer().props('filters')).toEqual(expect.objectContaining({ delivery: true }));
        const dialog = panel().get('[role="dialog"]');
        expect(dialog.get('h2').classes()).not.toContain('sr-only');
        expect(activeIn(panel().element)).toBe(true);

        // Con filtros, cerrar el resumen vuelve a la lista (filtrada), no a la bienvenida.
        await pressEscape();
        expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
        expect(panel().find('button[aria-label="Cerrar la lista"]').exists()).toBe(true);
    });

    it('al volver al celular con la lista abierta, un elegido y un filtro, buscar quita el resumen (BUG-055)', async () => {
        media.change(phoneWidth);
        const { showHomeList } = await import('@/navigation/tabs');
        const { items, panel } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        showHomeList('heading');
        await flushPromises();

        await resize(desktopWidth);
        await items()[0]?.trigger('click');
        await flushPromises();
        await panel().get('input[data-filter="delivery"]').setValue(true);
        await flushPromises();

        await resize(phoneWidth);
        expect(panel().find('[role="dialog"]').exists()).toBe(true);

        showHomeList('search');
        await flushPromises();
        expect(panel().find('[role="dialog"]').exists()).toBe(false);
        expect(document.activeElement).toBe(panel().get('input[type="search"]').element);
    });

    it('al volver al celular con filtros y sin elegido, abre la lista con el foco en su título', async () => {
        const { panel } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        const search = panel().get('input[type="search"]');
        (search.element as HTMLInputElement).focus();
        await search.setValue('ceiba');
        await flushPromises();

        await resize(phoneWidth);

        expect(panel().find('button[aria-label="Cerrar la lista"]').exists()).toBe(true);
        expect((panel().get('input[type="search"]').element as HTMLInputElement).value).toBe('ceiba');
        expect(document.activeElement).toBe(panel().get('section[aria-labelledby] h2').element);
    });

    it('al pasar del celular al computador, el foco que estaba en el panel va al buscador, o a la fila del elegido', async () => {
        media.change(phoneWidth);
        const { listButton, panel, items, wrapper } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        await listButton()?.trigger('click');
        await flushPromises();

        await resize(desktopWidth);
        expect(document.activeElement).toBe(panel().get('input[type="search"]').element);

        // Con un elegido (desde la lista del celular), a su fila, con la ruta pedida intacta.
        await resize(phoneWidth);
        await items()[1]?.trigger('click');
        await flushPromises();
        await panel().get('button[data-directions]').trigger('click');
        await flushPromises();

        await resize(desktopWidth);
        const row = wrapper.get(`li[data-row="${EL_GUADUAL.slug}"]`);
        expect(row.find('[data-close-directions]').exists()).toBe(true);
        // En su fila: su botón, o el panel de la ruta que va debajo.
        expect(activeIn(row.element)).toBe(true);
    });

    it('si el foco no estaba en el panel (en el mapa), no lo mueve', async () => {
        const { map } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        const outside = document.createElement('button');
        map().element.append(outside);
        outside.focus();

        await resize(phoneWidth);
        expect(document.activeElement).toBe(outside);
    });

    it('con el mapa caído, la barra y el aviso del mapa quedan lado a lado', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        engine.fails = true;
        const { panel, wrapper, map } = await mountHome({ answer: [LA_CEIBA, EL_GUADUAL] });
        await vi.dynamicImportSettled();
        await flushPromises();

        expect(map().find('[role="alert"]').exists()).toBe(true);
        const page = wrapper.get('inertia-head + div');
        expect(page.classes()).toContain('flex');
        expect(page.classes()).not.toContain('flex-col');
        expect(panel().attributes('role')).toBe('region');
        expect(panel().classes()).toEqual(expect.arrayContaining(['max-w-sm', 'shrink-0']));
        expect(wrapper.getComponent({ name: 'MapView' }).classes()).toEqual(expect.arrayContaining(['min-w-0', 'flex-1']));
        expect(wrapper.getComponent({ name: 'MapView' }).classes()).not.toContain('min-h-56');
    });
});
