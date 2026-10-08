import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Restaurant } from '@/restaurants/api';
import type * as FakeInertia from '@/testing/inertia';
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
async function mountHome({ locale = 'es', answer, url = '/' }: { locale?: 'es' | 'en'; answer?: readonly Restaurant[]; url?: string } = {}) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });
    // La dirección con que el servidor respondió el inicio (con ?r=slug, la de «Cómo llegar»).
    inertia.page.url = url;
    // Los demás pedidos (MapView pide el estilo al montarse) no llegan nunca: aquí nada sale a la red.
    const network = stubRestaurantsFetch(answer);

    const { default: Home } = await import('./Home.vue');
    const host = document.createElement('div');
    document.body.append(host);
    const wrapper = mount(Home, { attachTo: host });
    await flushPromises();

    /** El panel sobre el mapa: va primero en el documento. */
    const panel = () => wrapper.get('section');

    return {
        Home,
        inertia,
        network,
        wrapper,
        panel,
        /** La región que anuncia el estado de los restaurantes. */
        status: () => panel().get('[role="status"]'),
        // El espacio que no parte la línea de «3:00 p. m.» se compara como uno común.
        openStatus: () => panel().get('[data-status]').text().replaceAll(' ', ' '),
        listButton: () => panel().findAll('button').find((button) => ['Ver la lista', 'Show the list'].includes(button.text())),
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

    it('la bienvenida deja libre la atribución del mapa y se corre sobre el aviso de versión nueva', async () => {
        const { panel } = await mountHome();

        // La misma holgura que el aviso (UpdatePrompt.vue) más el lugar que él ocupa cuando se ve.
        expect(panel().classes()).toContain('bottom-[calc(var(--veni-attribution-clearance)_+_var(--veni-update-prompt-space,0px))]');
    });

    it('en un celular vertical el panel no llega a los botones de zoom, por larga que sea la lista', async () => {
        const { panel } = await mountHome();

        // Los botones ocupan 10 + 88 px desde arriba: el panel deja 7rem (112 px).
        expect(panel().classes()).toContain(
            'max-h-[calc(100%_-_var(--veni-attribution-clearance)_-_var(--veni-update-prompt-space,0px)_-_7rem)]',
        );
    });

    it('no pone botones de tema ni de idioma sobre el mapa: son de la cabecera', async () => {
        const { wrapper } = await mountHome({ answer: [LA_CEIBA] });

        expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Ver la lista']);
    });

    describe('los restaurantes', () => {
        it('van sobre el mapa, en el idioma de la interfaz', async () => {
            const { layer, network, wrapper } = await mountHome({ locale: 'en', answer: [LA_CEIBA, EL_GUADUAL] });

            expect(network.urls()).toEqual(['/api/restaurants.geojson?lang=en']);
            expect(layer().props()).toEqual({ restaurants: [LA_CEIBA, EL_GUADUAL], selected: null });
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
            ['es', '2 restaurantes en el mapa', 'Ver la lista'],
            ['en', '2 restaurants on the map', 'Show the list'],
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
            expect(loading.panel().get('h1 + p').classes()).not.toContain('max-[479px]:hidden');
            loading.wrapper.unmount();

            const ready = await mountHome({ answer: [LA_CEIBA] });
            expect(ready.panel().get('h1 + p').classes()).toContain('max-[479px]:hidden');
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
            const { listButton, mapAlert, page, panel, status } = await mountWithoutMap();

            expect(mapAlert().get('button').text()).toBe('Reintentar');
            // El aviso ocupa todo su mapa. El panel deja de flotar encima (quedaría
            // tapado): va antes, en una columna, y el mapa se queda con el resto.
            expect(page().classes()).toEqual(expect.arrayContaining(['flex', 'flex-col']));
            expect(panel().classes()).not.toContain('absolute');
            expect(status().text()).toBe('2 restaurantes en el mapa');
            expect(listButton()?.text()).toBe('Ver la lista');
        });

        it('la lista, que es la alternativa al mapa, se abre y deja elegir un restaurante', async () => {
            const { items, listButton, panel } = await mountWithoutMap();

            await listButton()?.trigger('click');
            await flushPromises();

            expect(items().map((item) => item.attributes('data-slug'))).toEqual(['prueba-la-ceiba', 'prueba-el-guadual']);
            expect(document.activeElement).toBe(panel().get('h2').element);

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

        it('se abre con su botón, con todos los restaurantes y el foco en su título', async () => {
            const { items, panel, wrapper } = await mountWithList();

            expect(items().map((item) => item.attributes('data-slug'))).toEqual(['prueba-la-ceiba', 'prueba-el-guadual']);
            expect(document.activeElement).toBe(panel().get('h2').element);
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

        it('sin el parámetro no elige a nadie', async () => {
            const { layer, panel } = await mountHome({ url: '/?lang=es', answer: [LA_CEIBA] });

            expect(panel().find('[role="dialog"]').exists()).toBe(false);
            expect(layer().props('selected')).toBeNull();
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
});
