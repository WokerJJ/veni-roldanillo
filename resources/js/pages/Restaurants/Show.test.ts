import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RestaurantProfile } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';
import { profile } from '@/testing/restaurants';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/** La ficha de un restaurante, con lo que el servidor manda en sus props. */
async function mountShow(restaurant: RestaurantProfile = profile(), locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    const meta = { title: restaurant.name, description: restaurant.description ?? '' };
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true, meta });

    const { default: Show } = await import('./Show.vue');
    const host = document.createElement('div');
    document.body.append(host);
    const wrapper = mount(Show, { props: { restaurant, meta }, attachTo: host });
    await flushPromises();

    return {
        Show,
        inertia,
        wrapper,
        // El espacio que no parte la línea de «3:00 p. m.» se compara como uno común.
        status: () => wrapper.get('header [data-status]').text().replaceAll(' ', ' '),
    };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // Miércoles 7 de octubre de 2026, 12:30 en Colombia: La Ceiba (11 a 15) está abierta.
    vi.setSystemTime(new Date('2026-10-07T12:30:00-05:00'));
});

afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
});

describe('Restaurants/Show', () => {
    it('el título del documento es el nombre del restaurante', async () => {
        const { wrapper } = await mountShow();

        expect(wrapper.get('inertia-head').attributes('title')).toBe('Restaurante de Prueba La Ceiba (ficticio)');
    });

    it('va en el layout común, con su pie de página: no pide el modo inmersivo del mapa', async () => {
        const { Show } = await mountShow();

        expect((Show as { layout?: unknown }).layout).toBeUndefined();
    });

    it('el nombre es el único título de primer nivel', async () => {
        const { wrapper } = await mountShow();

        expect(wrapper.findAll('h1')).toHaveLength(1);
        expect(wrapper.get('h1').text()).toBe('Restaurante de Prueba La Ceiba (ficticio)');
    });

    it.each([
        ['es', 'Volver al mapa'],
        ['en', 'Back to the map'],
    ] as const)('en %s, lo primero es un enlace para volver al mapa, de 44 px', async (locale, text) => {
        const { wrapper } = await mountShow(profile(), locale);
        const back = wrapper.get('a');

        expect(back.attributes('href')).toBe('/');
        expect(back.text()).toBe(text);
        expect(back.classes()).toContain('min-h-touch');
    });

    it('muestra el tipo de comida como una lista con nombre', async () => {
        const { wrapper } = await mountShow(
            profile({
                categories: [
                    { slug: 'asados', name: 'Asados' },
                    { slug: 'comidas-rapidas', name: 'Comidas rápidas' },
                ],
            }),
        );
        const list = wrapper.get('header ul');

        expect(list.attributes('aria-label')).toBe('Tipo de comida');
        expect(list.findAll('li').map((item) => item.text())).toEqual(['Asados', 'Comidas rápidas']);
    });

    it('sin categorías no deja una lista vacía', async () => {
        const { wrapper } = await mountShow(profile({ categories: [] }));

        expect(wrapper.find('header ul').exists()).toBe(false);
    });

    it('muestra la descripción, y sin descripción no deja el hueco', async () => {
        const described = await mountShow();
        expect(described.wrapper.get('header [data-description]').text()).toBe('Ficha de ejemplo para desarrollo. No corresponde a un negocio real.');
        described.wrapper.unmount();

        const bare = await mountShow(profile({ description: null }));
        expect(bare.wrapper.find('header [data-description]').exists()).toBe(false);
    });

    it('marca los datos de ejemplo, y solo esos', async () => {
        const sample = await mountShow();
        expect(sample.wrapper.get('header').text()).toContain('Datos de ejemplo');
        sample.wrapper.unmount();

        const real = await mountShow(profile({ fictitious: false, name: 'La Ceiba' }));
        expect(real.wrapper.text()).not.toContain('Datos de ejemplo');
    });

    describe('ver en el mapa', () => {
        // Dice lo que hace: abre el mapa con el restaurante elegido. La ruta
        // hasta él («Cómo llegar») todavía no existe.
        it.each([
            ['es', 'Ver en el mapa'],
            ['en', 'See on the map'],
        ] as const)('en %s, el botón abre el mapa del inicio con este restaurante elegido', async (locale, text) => {
            const { wrapper } = await mountShow(profile(), locale);
            const seeOnMap = wrapper.get('[data-see-on-map]');

            expect(seeOnMap.element.tagName).toBe('A');
            expect(seeOnMap.text()).toBe(text);
            expect(seeOnMap.attributes('href')).toBe('/?r=prueba-la-ceiba');
            expect(seeOnMap.classes()).toContain('min-h-touch');
        });

        it('en la dirección solo va el restaurante', async () => {
            const { wrapper } = await mountShow();
            const href = wrapper.get('[data-see-on-map]').attributes('href') ?? '';

            expect([...new URLSearchParams(href.slice(href.indexOf('?'))).keys()]).toEqual(['r']);
        });

        it('una ficha oculta no lo lleva: no está en el mapa', async () => {
            const { wrapper } = await mountShow(profile({ hidden: true }));

            expect(wrapper.find('[data-see-on-map]').exists()).toBe(false);
        });
    });

    describe('abierto ahora', () => {
        it.each([
            ['es', 'Abierto ahora · cierra a las 3:00 p. m.'],
            ['en', 'Open now · closes at 3:00 PM'],
        ] as const)('en %s dice si está abierto y hasta cuándo, con el horario que mandó el servidor', async (locale, text) => {
            const { status } = await mountShow(profile(), locale);

            expect(status()).toBe(text);
        });

        it('cerrado, dice cuándo abre', async () => {
            const { status } = await mountShow(profile({ hours: [{ weekday: 3, opens: '18:00', closes: '22:00' }] }));

            expect(status()).toBe('Cerrado · abre a las 6:00 p. m.');
        });

        it('un horario especial de hoy manda sobre el de la semana', async () => {
            const { status } = await mountShow(
                profile({ special_hours: [{ date: '2026-10-07', closed: true, opens: null, closes: null, note: 'Festivo de prueba' }] }),
            );

            expect(status()).toBe('Cerrado · abre mañana a las 11:00 a. m.');
        });

        it('sin horarios cargados no afirma que esté cerrado', async () => {
            const { status } = await mountShow(profile({ hours: [], special_hours: [] }));

            expect(status()).toBe('Horario sin confirmar');
        });

        it('se pone al día solo cuando pasa la hora de cierre', async () => {
            const { status } = await mountShow();

            // De las 12:30 a las 15:00 y un poco más: el reloj de la página avanza cada medio minuto.
            await vi.advanceTimersByTimeAsync(2.5 * 60 * 60 * 1000 + 30_000);

            expect(status()).toBe('Cerrado · abre mañana a las 11:00 a. m.');
        });
    });

    describe('horario', () => {
        it('muestra la semana con el día de hoy resaltado', async () => {
            const { wrapper } = await mountShow();
            const hours = wrapper.getComponent({ name: 'RestaurantHours' });

            expect(hours.findAll('tbody tr')).toHaveLength(7);
            expect(hours.get('tr[aria-current="date"] th span').text()).toBe('miércoles');
        });

        it('le pasa los horarios especiales con su nota', async () => {
            const { wrapper } = await mountShow(
                profile({ special_hours: [{ date: '2026-10-12', closed: true, opens: null, closes: null, note: 'Festivo de prueba' }] }),
            );

            expect(wrapper.getComponent({ name: 'RestaurantHours' }).get('[data-special]').text()).toContain('Festivo de prueba');
        });

        it('sin horario cargado, lo dice', async () => {
            const { wrapper } = await mountShow(profile({ hours: [] }));

            expect(wrapper.getComponent({ name: 'RestaurantHours' }).get('[data-empty]').text()).toContain('Todavía no tenemos el horario');
        });
    });

    describe('menú', () => {
        it('muestra el menú por secciones, con los precios', async () => {
            const { wrapper } = await mountShow();
            const menu = wrapper.getComponent({ name: 'RestaurantMenu' });

            expect(menu.findAll('h3').map((title) => title.text())).toEqual(['Platos fuertes (prueba)', 'Bebidas (prueba)']);
            expect(menu.findAll('[data-dish]')).toHaveLength(3);
            expect(menu.get('[data-price]').text()).toContain('18.500');
        });

        it('sin menú, lo dice', async () => {
            const { wrapper } = await mountShow(profile({ menu: [] }));

            expect(wrapper.getComponent({ name: 'RestaurantMenu' }).get('[data-empty]').text()).toBe('Este restaurante todavía no tiene el menú cargado.');
        });

        it('un plato agotado hoy deja de decirlo al día siguiente, sin volver a pedir nada', async () => {
            const { wrapper, inertia } = await mountShow();
            const menu = wrapper.getComponent({ name: 'RestaurantMenu' });

            // La bandeja del ejemplo está agotada hasta el 7 de octubre, que es hoy.
            expect(menu.findAll('[data-sold-out]')).toHaveLength(1);

            // De las 12:30 a pasada la medianoche: el reloj de la página avanza cada medio minuto.
            await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);

            expect(menu.findAll('[data-sold-out]')).toHaveLength(0);
            expect(inertia.router.reload).not.toHaveBeenCalled();
        });
    });

    describe('al volver la pestaña del fondo', () => {
        type ReloadOptions = {
            only?: string[];
            onSuccess?: () => void;
            onHttpException?: (response: { status: number }) => boolean | undefined;
            onNetworkError?: (error: Error) => boolean | undefined;
        };

        function setVisibility(state: 'visible' | 'hidden'): void {
            vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
            document.dispatchEvent(new Event('visibilitychange'));
        }

        /** La ficha lleva ese tiempo a la vista y la pestaña vuelve del fondo. */
        async function comeBackAfter(milliseconds: number) {
            const mounted = await mountShow();
            vi.setSystemTime(Date.now() + milliseconds);
            setVisibility('visible');

            return {
                ...mounted,
                reloads: () => mounted.inertia.router.reload.mock.calls.map(([options]) => options as ReloadOptions),
            };
        }

        afterEach(() => {
            vi.unstubAllGlobals();
            vi.restoreAllMocks();
        });

        it('pasado un minuto vuelve a pedir las props de la ficha, y solo esas', async () => {
            const { reloads } = await comeBackAfter(61_000);

            expect(reloads()).toHaveLength(1);
            expect(reloads()[0]?.only).toEqual(['restaurant', 'meta']);
        });

        it('antes del minuto no pide nada: lo que se ve sigue vigente', async () => {
            const { reloads } = await comeBackAfter(30_000);

            expect(reloads()).toHaveLength(0);
        });

        it('al irse al fondo no pide nada', async () => {
            const { inertia } = await mountShow();
            vi.setSystemTime(Date.now() + 61_000);

            setVisibility('hidden');

            expect(inertia.router.reload).not.toHaveBeenCalled();
        });

        it('cuando llegan, el minuto vuelve a empezar', async () => {
            const { reloads } = await comeBackAfter(61_000);
            reloads()[0]?.onSuccess?.();

            vi.setSystemTime(Date.now() + 30_000);
            setVisibility('visible');
            expect(reloads()).toHaveLength(1);

            vi.setSystemTime(Date.now() + 31_000);
            setVisibility('visible');
            expect(reloads()).toHaveLength(2);
        });

        it('si la ficha ya no está (404), abre la página de error del servidor en vez del aviso de Inertia', async () => {
            const reload = vi.fn();
            vi.stubGlobal('location', { reload });
            const { reloads } = await comeBackAfter(61_000);

            // false: Inertia no muestra la respuesta en su diálogo.
            expect(reloads()[0]?.onHttpException?.({ status: 404 })).toBe(false);
            expect(reload).toHaveBeenCalledOnce();
        });

        it.each([429, 500, 503])('con otro error (%i) se queda la ficha que había', async (status) => {
            const reload = vi.fn();
            vi.stubGlobal('location', { reload });
            const { reloads, wrapper } = await comeBackAfter(61_000);

            expect(reloads()[0]?.onHttpException?.({ status })).toBe(false);
            expect(reload).not.toHaveBeenCalled();
            expect(wrapper.get('h1').text()).toBe('Restaurante de Prueba La Ceiba (ficticio)');
        });

        it('sin señal se queda la ficha que había, y lo vuelve a intentar al regresar', async () => {
            const { reloads } = await comeBackAfter(61_000);

            expect(reloads()[0]?.onNetworkError?.(new TypeError('Failed to fetch'))).toBe(false);

            setVisibility('visible');
            expect(reloads()).toHaveLength(2);
        });

        it('al salir de la ficha deja de escuchar', async () => {
            const { wrapper, inertia } = await mountShow();
            wrapper.unmount();
            vi.setSystemTime(Date.now() + 61_000);

            setVisibility('visible');

            expect(inertia.router.reload).not.toHaveBeenCalled();
        });
    });

    describe('domicilios', () => {
        it('si hace domicilios lo dice arriba y muestra a qué barrios lleva', async () => {
            const { wrapper } = await mountShow();

            expect(wrapper.get('header [data-delivery]').text()).toBe('Hace domicilios');
            expect(wrapper.getComponent({ name: 'RestaurantDelivery' }).findAll('[data-zone]')).toHaveLength(2);
        });

        it('si no hace domicilios, no dice nada de domicilios', async () => {
            const { wrapper } = await mountShow(profile({ delivery: { available: false, notes: null, zones: [] } }));

            expect(wrapper.find('header [data-delivery]').exists()).toBe(false);
            expect(wrapper.findComponent({ name: 'RestaurantDelivery' }).exists()).toBe(false);
        });
    });

    describe('contacto', () => {
        it('muestra la dirección, el teléfono, el WhatsApp y los medios de pago del negocio', async () => {
            const { wrapper } = await mountShow();
            const contact = wrapper.getComponent({ name: 'RestaurantContact' });

            expect(contact.get('[data-address]').text()).toContain('Calle de Prueba # 1-23');
            expect(contact.get('[data-phone] a').attributes('href')).toBe('tel:+576020000000');
            expect(contact.get('[data-whatsapp] a').attributes('href')).toBe('https://wa.me/570009998877');
            expect(contact.findAll('[data-payments] li').map((item) => item.text())).toEqual(['Efectivo', 'Nequi']);
        });

        it('sin ningún dato de contacto, no deja el título solo', async () => {
            const { wrapper } = await mountShow(
                profile({ address: null, reference: null, phone: null, whatsapp: null, payment_methods: [], price_level: null }),
            );

            expect(wrapper.findAll('h2').map((title) => title.text())).toEqual(['Horario', 'Menú', 'Domicilios']);
        });
    });

    describe('encabezados', () => {
        it('van en orden: el nombre, las secciones y, dentro de ellas, sus partes', async () => {
            const { wrapper } = await mountShow(
                profile({ special_hours: [{ date: '2026-10-12', closed: true, opens: null, closes: null, note: null }] }),
            );
            const headings = wrapper.findAll('h1, h2, h3').map((heading) => `${heading.element.tagName} ${heading.text()}`);

            expect(headings).toEqual([
                'H1 Restaurante de Prueba La Ceiba (ficticio)',
                'H2 Horario',
                'H3 Horarios especiales',
                'H2 Menú',
                'H3 Platos fuertes (prueba)',
                'H3 Bebidas (prueba)',
                'H2 Domicilios',
                'H3 Barrios y costo del domicilio',
                'H2 Ubicación y contacto',
            ]);
        });
    });

    describe('información sin verificar', () => {
        it.each([
            ['es', 'Información sin verificar · actualizada el 5 de octubre de 2026.'],
            ['en', 'Unverified information · updated on October 5, 2026.'],
        ] as const)('en %s, una ficha sin reclamar lo dice, con la fecha de la última actualización', async (locale, text) => {
            const { wrapper } = await mountShow(profile({ unverified: true }), locale);

            expect(wrapper.get('[data-unverified]').text()).toBe(text);
        });

        it('sin fecha, lo dice igual', async () => {
            const { wrapper } = await mountShow(profile({ unverified: true, updated_on: null }));

            expect(wrapper.get('[data-unverified]').text()).toBe('Información sin verificar.');
        });

        it('una ficha reclamada no lleva el aviso', async () => {
            const { wrapper } = await mountShow(profile({ unverified: false }));

            expect(wrapper.find('[data-unverified]').exists()).toBe(false);
        });
    });

    describe('ficha oculta', () => {
        it('a quien puede verla le avisa que el público no la ve', async () => {
            const { wrapper } = await mountShow(profile({ hidden: true }));

            expect(wrapper.get('[data-hidden]').text()).toBe('Esta ficha está oculta: solo la ven la gente del restaurante y la administración.');
        });

        it('una ficha publicada no lleva el aviso', async () => {
            const { wrapper } = await mountShow();

            expect(wrapper.find('[data-hidden]').exists()).toBe(false);
        });
    });
});
