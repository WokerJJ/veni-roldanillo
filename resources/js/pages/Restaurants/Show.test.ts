import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaymentMethod, RestaurantProfile } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';
import { desktopWidth, phoneWidth, stubMedia } from '@/testing/media';
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
        status: () => wrapper.get('[data-status]').text().replaceAll(' ', ' '),
    };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    // Un celular, salvo que la prueba diga otra cosa (ADR 0038).
    stubMedia(phoneWidth);
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // Miércoles 7 de octubre de 2026, 12:30 en Colombia: La Ceiba (11 a 15) está abierta.
    vi.setSystemTime(new Date('2026-10-07T12:30:00-05:00'));
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

    it('muestra la descripción antes del menú, y sin descripción no deja el hueco', async () => {
        const described = await mountShow(profile({ fictitious: false, description: 'Comida de la casa desde 1990.' }));
        expect(described.wrapper.get('.ficha-main > [data-description]').text()).toBe('Comida de la casa desde 1990.');
        expect(described.wrapper.findAll('.ficha-main > [data-description], [data-ficha-footer] > [data-description]')).toHaveLength(1);
        described.wrapper.unmount();

        const bare = await mountShow(profile({ description: null }));
        expect(bare.wrapper.find('.ficha-main > [data-description], [data-ficha-footer] > [data-description]').exists()).toBe(false);
    });

    it('la descripción de una ficha de ejemplo es su aviso: va al pie, no arriba (#125)', async () => {
        const { wrapper } = await mountShow();

        expect(wrapper.get('[data-ficha-footer] > [data-description]').text()).toBe('Ficha de ejemplo para desarrollo. No corresponde a un negocio real.');
        expect(wrapper.find('.ficha-main > [data-description]').exists()).toBe(false);
    });

    it('marca los datos de ejemplo, y solo esos', async () => {
        const sample = await mountShow();
        expect(sample.wrapper.get('header').text()).toContain('Datos de ejemplo');
        sample.wrapper.unmount();

        const real = await mountShow(profile({ fictitious: false, name: 'La Ceiba' }));
        expect(real.wrapper.text()).not.toContain('Datos de ejemplo');
    });

    describe('cómo llegar', () => {
        // Abre el mapa del inicio con este restaurante elegido y la ruta hasta él (#11).
        it.each([
            ['es', 'Cómo llegar'],
            ['en', 'Directions'],
        ] as const)('en %s, el botón abre el mapa del inicio con este restaurante elegido', async (locale, text) => {
            const { wrapper } = await mountShow(profile(), locale);
            const directions = wrapper.get('[data-directions]');

            expect(directions.element.tagName).toBe('A');
            expect(directions.text()).toBe(text);
            expect(directions.attributes('href')).toBe('/?r=prueba-la-ceiba');
            expect(directions.classes()).toContain('min-h-touch');
        });

        it('en la dirección solo va el restaurante', async () => {
            const { wrapper } = await mountShow();
            const href = wrapper.get('[data-directions]').attributes('href') ?? '';

            expect([...new URLSearchParams(href.slice(href.indexOf('?'))).keys()]).toEqual(['r']);
        });

        it('al tocarlo, deja pedida la ruta hasta este restaurante, en la memoria de la página', async () => {
            const { wrapper } = await mountShow();
            const { takeDirections } = await import('@/routing/intent');

            await wrapper.get('[data-directions]').trigger('click');

            expect(takeDirections('otro')).toBe(false);
            await wrapper.get('[data-directions]').trigger('click');
            expect(takeDirections('prueba-la-ceiba')).toBe(true);
            // Una sola vez.
            expect(takeDirections('prueba-la-ceiba')).toBe(false);
            // Ni en el almacenamiento del navegador.
            const stored = [window.localStorage, window.sessionStorage].flatMap((storage) =>
                Array.from({ length: storage.length }, (_, index) => `${storage.key(index) ?? ''}=${storage.getItem(storage.key(index) ?? '') ?? ''}`),
            );
            expect(stored.join(' ')).not.toContain('prueba-la-ceiba');
        });

        it.each([
            ['Ctrl', { ctrlKey: true }],
            ['Cmd', { metaKey: true }],
            ['Shift', { shiftKey: true }],
            ['Alt', { altKey: true }],
            ['la rueda', { button: 1 }],
        ] as const)('abierto con %s (otra pestaña o ventana), no deja pedida la ruta en esta', async (_name, init) => {
            const { wrapper } = await mountShow();
            const { takeDirections } = await import('@/routing/intent');

            wrapper.get('[data-directions]').element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
            await flushPromises();

            expect(takeDirections('prueba-la-ceiba')).toBe(false);
        });

        it('una ficha oculta no lo lleva: no está en el mapa', async () => {
            const { wrapper } = await mountShow(profile({ hidden: true }));

            expect(wrapper.find('[data-directions]').exists()).toBe(false);
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

        it('sin horario semanal, un horario especial que viene no lo da por cerrado (BUG-035)', async () => {
            const { status } = await mountShow(
                profile({ hours: [], special_hours: [{ date: '2026-10-12', closed: true, opens: null, closes: null, note: 'Festivo de prueba' }] }),
            );

            expect(status()).toBe('Horario sin confirmar');
        });

        it('sin horario semanal, un horario especial de hoy que abre sí dice «Abierto»', async () => {
            const { status } = await mountShow(
                profile({ hours: [], special_hours: [{ date: '2026-10-07', closed: false, opens: '12:00', closes: '14:00', note: null }] }),
            );

            expect(status()).toBe('Abierto ahora · cierra a las 2:00 p. m.');
        });

        it('se pone al día solo cuando pasa la hora de cierre', async () => {
            const { status } = await mountShow();

            // De las 12:30 a las 15:00 y un poco más: el reloj de la página avanza cada medio minuto.
            await vi.advanceTimersByTimeAsync(2.5 * 60 * 60 * 1000 + 30_000);

            expect(status()).toBe('Cerrado · abre mañana a las 11:00 a. m.');
        });
    });

    describe('horario', () => {
        it('a la vista, solo el de hoy; la semana, agrupada, se despliega con «Ver semana» (#125, #82)', async () => {
            const { wrapper } = await mountShow(profile({ special_hours: [] }));
            const hours = wrapper.getComponent({ name: 'RestaurantHours' });

            expect(hours.get('[data-today]').text().replace(/\s+/g, ' ')).toBe('Hoy 11:00 a. m. – 3:00 p. m.');
            expect(hours.get('details summary').text()).toBe('Ver semana');
            expect(hours.get('details').attributes('open')).toBeUndefined();
            // La Ceiba abre igual los siete días: una sola fila.
            expect(hours.findAll('details tbody tr').map((row) => row.get('[data-days]').text())).toEqual(['Lun–Dom']);
        });

        it('pasada la medianoche, con el turno de anoche abierto, «Hoy» es el de ese turno: no contradice el estado (BUG-034)', async () => {
            vi.setSystemTime(new Date('2026-10-08T00:30:00-05:00'));
            const { wrapper, status } = await mountShow(profile({ hours: [{ weekday: 3, opens: '18:00', closes: '02:00' }], special_hours: [] }));

            expect(status()).toBe('Abierto ahora · cierra a las 2:00 a. m.');
            expect(wrapper.get('[data-today]').text().replace(/\s+/g, ' ')).toBe('Hoy 6:00 p. m. – 2:00 a. m.');
        });

        it('el estado va dentro de la sección «Horario», antes de la línea de hoy (EVA-039)', async () => {
            const { wrapper } = await mountShow();
            const status = wrapper.get('[data-status]').element;
            const section = status.closest('section');

            expect(section?.querySelector('h2')?.textContent).toBe('Horario');
            expect(status.compareDocumentPosition(wrapper.get('[data-today]').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

            expect(wrapper.get('[data-aside] [data-delivery]').text()).toBe('Hace domicilios');
            expect(wrapper.getComponent({ name: 'RestaurantDelivery' }).findAll('[data-zone]')).toHaveLength(2);
        });

        it('si no hace domicilios, no dice nada de domicilios', async () => {
            const { wrapper } = await mountShow(profile({ delivery: { available: false, notes: null, zones: [] } }));

            expect(wrapper.find('[data-delivery]').exists()).toBe(false);
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
                profile({ address: null, reference: null, phone: null, whatsapp: null, payment_methods: [], price_range: null }),
            );

            expect(wrapper.findAll('h2').map((title) => title.text())).toEqual(['Horario', 'Promociones', 'Menú', 'Domicilios']);
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
                'H2 Promociones',
                'H2 Menú',
                'H3 Platos fuertes (prueba)',
                'H3 Bebidas (prueba)',
                'H2 Ubicación y contacto',
                'H2 Domicilios',
                'H3 Barrios y costo del domicilio',
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

    describe('reclamar y pedir el retiro (#20)', () => {
        it('una ficha sin reclamar lleva «¿Es tu negocio? Reclámalo» a su formulario', async () => {
            const { wrapper } = await mountShow(profile({ claimable: true }));
            const link = wrapper.get('[data-claim]');

            expect(link.text()).toBe('¿Es tu negocio? Reclámalo');
            expect(link.attributes('href')).toBe('/restaurants/prueba-la-ceiba/claim');
        });

        it('una ficha reclamada no ofrece reclamarla', async () => {
            const { wrapper } = await mountShow(profile({ unverified: true, claimable: false }));

            expect(wrapper.find('[data-claim]').exists()).toBe(false);
        });

        it.each([true, false])('toda ficha publicada ofrece pedir su retiro (sin reclamar: %s)', async (unverified) => {
            const { wrapper } = await mountShow(profile({ unverified }));
            const link = wrapper.get('[data-removal]');

            expect(link.text()).toBe('Pedir que retiren esta ficha');
            expect(link.attributes('href')).toBe('/restaurants/prueba-la-ceiba/removal');
        });

        it('una ficha oculta no ofrece ninguno de los dos', async () => {
            const { wrapper } = await mountShow(profile({ hidden: true, unverified: false }));

            expect(wrapper.find('[data-claim]').exists()).toBe(false);
            expect(wrapper.find('[data-removal]').exists()).toBe(false);
        });

        it('en inglés', async () => {
            const { wrapper } = await mountShow(profile({ unverified: true, claimable: true }), 'en');

            expect(wrapper.get('[data-claim]').text()).toBe('Is this your business? Claim it');
            expect(wrapper.get('[data-removal]').text()).toBe('Ask to remove this listing');
        });
    });

    describe('lo que publica el dueño desde su panel (#18)', () => {
        it.each([
            ['es', 'Demora de 40 min.'],
            ['en', '40 min delay.'],
        ] as const)('en %s, el aviso de demora vigente se anuncia', async (locale, text) => {
            const { wrapper } = await mountShow(profile({ delay_minutes: 40 }), locale);

            expect(wrapper.get('[data-delay]').text()).toBe(text);
            expect(wrapper.get('[data-delay]').attributes('role')).toBe('status');
        });

        it('sin aviso, nada', async () => {
            const { wrapper } = await mountShow(profile({ delay_minutes: null, delay_until: null }));

            expect(wrapper.find('[data-delay]').exists()).toBe(false);
        });

        it('el aviso se va solo al vencer, sin volver a pedir la ficha', async () => {
            // Son las 12:30 (beforeEach); el aviso vale hasta las 12:40.
            const { wrapper } = await mountShow(profile({ delay_minutes: 40, delay_until: '2026-10-07T12:40:00-05:00' }));
            expect(wrapper.find('[data-delay]').exists()).toBe(true);

            vi.setSystemTime(new Date('2026-10-07T12:41:00-05:00'));
            await vi.advanceTimersByTimeAsync(30_000);

            expect(wrapper.find('[data-delay]').exists()).toBe(false);
        });

        it('un aviso que ya venció al llegar no se muestra', async () => {
            const { wrapper } = await mountShow(profile({ delay_minutes: 40, delay_until: '2026-10-07T12:00:00-05:00' }));

            expect(wrapper.find('[data-delay]').exists()).toBe(false);
        });

        it('una ficha reclamada dice cuándo la actualizó el restaurante; una sin reclamar, no', async () => {
            const claimed = await mountShow(profile({ unverified: false, owner_updated_on: '2026-10-05' }));
            expect(claimed.wrapper.get('[data-owner-updated]').text()).toBe('Actualizada por el restaurante el 5 de octubre de 2026.');

            const unclaimed = await mountShow(profile({ unverified: true, owner_updated_on: '2026-10-05' }));
            expect(unclaimed.wrapper.find('[data-owner-updated]').exists()).toBe(false);

            const never = await mountShow(profile({ unverified: false, owner_updated_on: null }));
            expect(never.wrapper.find('[data-owner-updated]').exists()).toBe(false);
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

describe('Restaurants/Show: promociones (#113)', () => {
    it('sin promociones vigentes (o de una ficha guardada antes) no hay sección', async () => {
        // Una ficha guardada antes de #113 no trae la clave.
        const older: RestaurantProfile = profile();
        delete older.promotions;

        for (const restaurant of [profile({ promotions: [] }), older]) {
            const { wrapper } = await mountShow(restaurant);

            expect(wrapper.findAll('h2').map((title) => title.text())).not.toContain('Promociones');
            wrapper.unmount();
        }
    });
});

describe('Restaurants/Show: dos columnas en computador y lo importante primero en el celular (#125, #82)', () => {
    /** Las partes de la ficha en el orden del documento: la cabecera, lo de un vistazo y la columna principal. */
    const order = (wrapper: Awaited<ReturnType<typeof mountShow>>['wrapper']) =>
        [...wrapper.get('.ficha-grid').element.children].map((child) => child.className.split(' ')[0]);

    describe('en el celular', () => {
        it('van primero el estado, el horario de hoy y «Cómo llegar»; después el menú, y al final contacto y domicilios, en el orden de computador', async () => {
            const { wrapper } = await mountShow();
            const aside = wrapper.get('[data-aside]');
            const titles = wrapper.get('.ficha-main').findAll('h2').map((title) => title.text());

            expect(order(wrapper)).toEqual(['ficha-head', 'ficha-aside', 'ficha-main']);
            expect(aside.find('[data-status]').exists()).toBe(true);
            expect(aside.find('[data-today]').exists()).toBe(true);
            expect(aside.find('[data-directions]').exists()).toBe(true);
            expect(aside.find('[data-favorite]').exists()).toBe(true);
            expect(titles).toEqual(['Promociones', 'Menú', 'Ubicación y contacto', 'Domicilios']);
        });

        it.each([
            ['es', 'Carta y datos', ['Platos fuertes (prueba)', 'Bebidas (prueba)', 'Ubicación y contacto', 'Domicilios']],
            ['en', 'Menu and details', ['Platos fuertes (prueba)', 'Bebidas (prueba)', 'Location and contact', 'Delivery']],
        ] as const)('en %s, unas pestañas con nombre llevan a cada sección de la carta y al contacto, con enlaces de 44 px, y el foco va a la sección (EVA-040)', async (locale, label, texts) => {
            const { wrapper } = await mountShow(profile(), locale);
            const nav = wrapper.get('nav[data-sections]');
            const links = nav.findAll('a');

            expect(nav.attributes('aria-label')).toBe(label);
            expect(links.map((link) => link.text())).toEqual(texts);
            for (const link of links) {
                const target = (link.attributes('href') ?? '').slice(1);

                expect(link.classes()).toContain('min-h-touch');
                expect(document.getElementById(target)).not.toBeNull();
                // Un enlace a un ancla solo mueve el foco si el destino lo puede recibir.
                expect(document.getElementById(target)?.getAttribute('tabindex')).toBe('-1');
            }
        });

        it('las pestañas solo llevan las secciones que hay, y con una sola no salen', async () => {
            const some = await mountShow(profile({ delivery: { available: false, notes: null, zones: [] }, promotions: [] }));
            expect(some.wrapper.findAll('nav[data-sections] a').map((link) => link.text())).toEqual(['Platos fuertes (prueba)', 'Bebidas (prueba)', 'Ubicación y contacto']);
            some.wrapper.unmount();

            const none = await mountShow(
                profile({
                    menu: [{ name: 'Única', dishes: [] }],
                    delivery: { available: false, notes: null, zones: [] },
                    promotions: [],
                    address: null,
                    reference: null,
                    phone: null,
                    whatsapp: null,
                    payment_methods: [],
                    price_range: null,
                }),
            );
            expect(none.wrapper.find('nav[data-sections]').exists()).toBe(false);
        });

        it('un medio de pago que la app no conoce no cuenta como contacto: no lleva a una sección que no sale (BUG-037)', async () => {
            const { wrapper } = await mountShow(
                profile({ address: null, reference: null, phone: null, whatsapp: null, price_range: null, payment_methods: ['bitcoin' as PaymentMethod] }),
            );

            expect(wrapper.findAll('nav[data-sections] a').map((link) => link.text())).toEqual(['Platos fuertes (prueba)', 'Bebidas (prueba)', 'Domicilios']);
            expect(wrapper.find('#ficha-contacto').exists()).toBe(false);
        });

        it('la columna de lo de un vistazo es parte de la página: ni región ni foco propio (EVA-038)', async () => {
            const { wrapper } = await mountShow();
            const aside = wrapper.get('[data-aside]');

            expect(aside.attributes('tabindex')).toBeUndefined();
            expect(aside.attributes('role')).toBeUndefined();
            expect(aside.attributes('aria-label')).toBeUndefined();
        });
    });

    describe('en computador (desde 1024 px)', () => {
        it.each([
            ['es', 'Datos del restaurante'],
            ['en', 'Restaurant details'],
        ] as const)('en %s, la columna fija se alcanza con el teclado para desplazarla: una región con nombre (EVA-038)', async (locale, label) => {
            stubMedia(desktopWidth);
            const { wrapper } = await mountShow(profile(), locale);
            const aside = wrapper.get('[data-aside]');

            expect(aside.attributes('tabindex')).toBe('0');
            expect(aside.attributes('role')).toBe('region');
            expect(aside.attributes('aria-label')).toBe(label);
        });

        it('al cruzar los 1024 px, el foco que estaba en el contacto o los domicilios sigue en lo mismo (BUG-036)', async () => {
            const media = stubMedia(phoneWidth);
            const { wrapper } = await mountShow();
            (wrapper.get('.ficha-main [data-whatsapp] a').element as HTMLElement).focus();

            media.change(desktopWidth);
            await flushPromises();
            expect(document.activeElement).toBe(wrapper.get('[data-aside] [data-whatsapp] a').element);

            media.change(phoneWidth);
            await flushPromises();
            expect(document.activeElement).toBe(wrapper.get('.ficha-main [data-whatsapp] a').element);

            document.getElementById('ficha-domicilios')?.focus();
            media.change(desktopWidth);
            await flushPromises();
            expect(document.activeElement).toBe(wrapper.get('[data-aside] #ficha-domicilios').element);
        });

        it('al salir de la ficha deja de escuchar el ancho de la ventana', async () => {
            const media = stubMedia(phoneWidth);
            const { wrapper } = await mountShow();
            const desktopListeners = () => [...media.listeners.values()].filter((query) => query === '(min-width: 64rem)');
            expect(desktopListeners()).toHaveLength(1);

            wrapper.unmount();

            expect(desktopListeners()).toEqual([]);
        });

        it('lo de un vistazo, el contacto y los domicilios van en la columna de la derecha, antes del menú en el documento', async () => {
            stubMedia(desktopWidth);
            const { wrapper } = await mountShow();
            const aside = wrapper.get('[data-aside]');

            expect(order(wrapper)).toEqual(['ficha-head', 'ficha-aside', 'ficha-main']);
            expect(aside.findAll('h2').map((title) => title.text())).toEqual(['Horario', 'Ubicación y contacto', 'Domicilios']);
            expect(aside.find('[data-whatsapp]').exists()).toBe(true);
            expect(aside.find('[data-payments]').exists()).toBe(true);
            expect(wrapper.get('.ficha-main').findAll('h2').map((title) => title.text())).toEqual(['Promociones', 'Menú']);
        });

        it('usa el mismo corte que el inicio (DESKTOP_QUERY, ADR 0037)', async () => {
            const media = stubMedia(phoneWidth);
            await mountShow();
            const { DESKTOP_QUERY } = await import('@/composables/useMediaQuery');

            expect(media.matchMedia).toHaveBeenCalledWith(DESKTOP_QUERY);
        });

        it('no lleva la navegación del celular ni repite «Hace domicilios»: la sección está al lado', async () => {
            stubMedia(desktopWidth);
            const { wrapper } = await mountShow();

            expect(wrapper.find('nav[data-sections]').exists()).toBe(false);
            expect(wrapper.find('[data-delivery]').exists()).toBe(false);
        });

        it('al cambiar el ancho de la ventana, el contacto y los domicilios cambian de columna', async () => {
            const media = stubMedia(phoneWidth);
            const { wrapper } = await mountShow();
            expect(wrapper.find('[data-aside] [data-whatsapp]').exists()).toBe(false);

            media.change(desktopWidth);
            await flushPromises();
            expect(wrapper.find('[data-aside] [data-whatsapp]').exists()).toBe(true);
            expect(wrapper.findAll('[data-whatsapp]')).toHaveLength(1);

            media.change(phoneWidth);
            await flushPromises();
            expect(wrapper.find('.ficha-main [data-whatsapp]').exists()).toBe(true);
        });

        it('los encabezados siguen en orden', async () => {
            stubMedia(desktopWidth);
            const { wrapper } = await mountShow();

            expect(wrapper.findAll('h1, h2').map((heading) => `${heading.element.tagName} ${heading.text()}`)).toEqual([
                'H1 Restaurante de Prueba La Ceiba (ficticio)',
                'H2 Horario',
                'H2 Ubicación y contacto',
                'H2 Domicilios',
                'H2 Promociones',
                'H2 Menú',
            ]);
        });
    });

    describe('cabecera compacta y pie de la ficha', () => {
        it('la cabecera lleva solo el nombre, el rótulo de ejemplo y el tipo de comida', async () => {
            const { wrapper } = await mountShow(profile({ unverified: true, claimable: true }));
            const header = wrapper.get('header');

            expect(header.find('h1').exists()).toBe(true);
            expect(header.find('[data-sample]').exists()).toBe(true);
            expect(header.find('[data-category]').exists()).toBe(true);
            for (const notice of ['[data-unverified]', '[data-claim]', '[data-removal]', '[data-description]', '[data-status]']) {
                expect(header.find(notice).exists()).toBe(false);
            }
        });

        it('«Información sin verificar», «¿Es tu negocio?» y «Pedir que retiren esta ficha» van al pie, después del menú', async () => {
            const { wrapper } = await mountShow(profile({ unverified: true, claimable: true }));
            const footer = wrapper.get('[data-ficha-footer]');

            expect(footer.find('[data-unverified]').exists()).toBe(true);
            expect(footer.find('[data-claim]').exists()).toBe(true);
            expect(footer.find('[data-removal]').exists()).toBe(true);
            expect(wrapper.get('.ficha-grid').element.compareDocumentPosition(footer.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        });

        it('«Actualizada por el restaurante» también va al pie', async () => {
            const { wrapper } = await mountShow(profile({ unverified: false, owner_updated_on: '2026-10-05' }));

            expect(wrapper.find('[data-ficha-footer] [data-owner-updated]').exists()).toBe(true);
        });
    });

    describe('«Ver semana»', () => {
        it.each([
            ['es', 'Ver semana y horarios especiales'],
            ['en', 'See the week and special hours'],
        ] as const)('en %s, con horarios especiales que vienen, lo dice y los muestra al desplegar', async (locale, summary) => {
            const { wrapper } = await mountShow(
                profile({ special_hours: [{ date: '2026-10-12', closed: true, opens: null, closes: null, note: 'Festivo de prueba' }] }),
                locale,
            );
            const details = wrapper.get('details[data-week]');

            expect(details.get('summary').text()).toBe(summary);
            expect(details.get('[data-special]').text()).toContain('Festivo de prueba');
        });

        it('se despliega con el teclado: es un <details> con su <summary>, de 44 px', async () => {
            const { wrapper } = await mountShow();
            const details = wrapper.get('details[data-week]');

            expect(details.element.firstElementChild?.tagName).toBe('SUMMARY');
            expect(details.get('summary').classes()).toContain('min-h-touch');
        });
    });
});

describe('Restaurants/Show: portada y pestañas fijas del celular (#141, M7)', () => {
    /** Un IntersectionObserver de mentira: guarda lo que se le pide observar y deja avisar qué cruza la franja. */
    function stubObserver() {
        const observed: Element[] = [];
        const instances: { options: IntersectionObserverInit | undefined; disconnect: ReturnType<typeof vi.fn> }[] = [];
        let notify: IntersectionObserverCallback = () => undefined;

        vi.stubGlobal(
            'IntersectionObserver',
            class {
                disconnect = vi.fn();

                constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
                    notify = callback;
                    instances.push({ options, disconnect: this.disconnect });
                }
                observe = (element: Element): void => {
                    observed.push(element);
                };
                unobserve = vi.fn();
            },
        );

        return {
            observed,
            instances,
            cross: (id: string, isIntersecting: boolean): void => {
                notify([{ target: document.getElementById(id), isIntersecting } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
            },
        };
    }

    it('con una promoción con imagen, la portada la muestra con su título y hasta cuándo vale; la imagen es decorativa', async () => {
        const { wrapper } = await mountShow();
        const cover = wrapper.get('[data-cover]');

        expect(cover.classes()).not.toContain('ficha-cover-brand');
        expect(cover.get('img').attributes('alt')).toBe('');
        expect(cover.get('img').attributes('src')).toContain('abcdefabcdefabcdef01-640.webp');
        expect(cover.get('[data-cover-promotion]').text()).toContain('Jugo gratis con el sancocho (prueba)');
        expect(cover.get('[data-cover-promotion]').text()).toContain('Hasta');
        // Es lo primero que se ve en el celular: se pide con prioridad.
        expect(cover.get('img').attributes('fetchpriority')).toBe('high');
    });

    it('el título de la portada no se lee dos veces: la sección «Promociones» ya lo dice', async () => {
        const { wrapper } = await mountShow();

        expect(wrapper.get('[data-cover-promotion]').attributes('aria-hidden')).toBe('true');
        expect(wrapper.get('#ficha-promociones').text()).toContain('Jugo gratis con el sancocho (prueba)');
    });

    it('sin promoción, el fondo de la marca con el ícono de la categoría', async () => {
        const { wrapper } = await mountShow(profile({ promotions: [] }));
        const cover = wrapper.get('[data-cover]');

        expect(cover.classes()).toContain('ficha-cover-brand');
        expect(cover.find('img').exists()).toBe(false);
        expect(cover.find('[data-cover-promotion]').exists()).toBe(false);
        expect(cover.find('svg').exists()).toBe(true);
    });

    it('una promoción sin imagen no hace portada: se usa el fondo de la marca', async () => {
        const { wrapper } = await mountShow(profile({ promotions: [{ title: 'Sin imagen', ends_at: '2026-10-07T22:00:00-05:00', image: null }] }));

        expect(wrapper.get('[data-cover]').classes()).toContain('ficha-cover-brand');
    });

    it('en computador no hay portada ni pestañas', async () => {
        stubMedia(desktopWidth);
        const { wrapper } = await mountShow();

        expect(wrapper.find('[data-cover]').exists()).toBe(false);
        expect(wrapper.find('nav[data-sections]').exists()).toBe(false);
    });

    it('la pestaña de la sección que se lee queda marcada (aria-current) y cambia al desplazarse', async () => {
        const spy = stubObserver();
        const { wrapper } = await mountShow();
        const current = () => wrapper.findAll('nav[data-sections] a[aria-current]').map((link) => link.text());

        expect(spy.observed.map((element) => element.id)).toEqual(['ficha-menu-0', 'ficha-menu-1', 'ficha-contacto', 'ficha-domicilios']);
        // Al abrir, la primera.
        expect(current()).toEqual(['Platos fuertes (prueba)']);

        spy.cross('ficha-menu-0', true);
        await flushPromises();
        expect(current()).toEqual(['Platos fuertes (prueba)']);

        spy.cross('ficha-menu-0', false);
        spy.cross('ficha-menu-1', true);
        await flushPromises();
        expect(current()).toEqual(['Bebidas (prueba)']);

        // Un hueco entre dos secciones: se queda la última.
        spy.cross('ficha-menu-1', false);
        await flushPromises();
        expect(current()).toEqual(['Bebidas (prueba)']);
    });

    it('sin IntersectionObserver, la primera pestaña queda marcada', async () => {
        vi.stubGlobal('IntersectionObserver', undefined);
        const { wrapper } = await mountShow();

        expect(wrapper.findAll('nav[data-sections] a[aria-current]').map((link) => link.text())).toEqual(['Platos fuertes (prueba)']);
    });

    it('si la carta cambia y la sección marcada ya no está, se marca la primera: nunca una que no existe (BUG-005)', async () => {
        const spy = stubObserver();
        const { wrapper } = await mountShow();
        const current = () => wrapper.findAll('nav[data-sections] a[aria-current]').map((link) => link.text());

        spy.cross('ficha-domicilios', true);
        await flushPromises();
        expect(current()).toEqual(['Domicilios']);

        // La ficha se volvió a pedir y ya no hace domicilios.
        await wrapper.setProps({ restaurant: profile({ delivery: { available: false, notes: null, zones: [] } }) });
        await flushPromises();

        expect(current()).toEqual(['Platos fuertes (prueba)']);
    });

    it('si dos secciones cruzan la franja, se marca la primera de la página', async () => {
        const spy = stubObserver();
        const { wrapper } = await mountShow();

        spy.cross('ficha-menu-1', true);
        spy.cross('ficha-menu-0', true);
        await flushPromises();

        expect(wrapper.get('nav[data-sections] a[aria-current]').text()).toBe('Platos fuertes (prueba)');
    });

    it('al pasar a computador, deja de mirar las secciones', async () => {
        const media = stubMedia(phoneWidth);
        const spy = stubObserver();
        const { wrapper } = await mountShow();

        expect(spy.observed).not.toHaveLength(0);

        media.change(desktopWidth);
        await flushPromises();

        expect(wrapper.find('nav[data-sections]').exists()).toBe(false);
        expect(spy.instances).toHaveLength(1);
        expect(spy.instances[0]?.disconnect).toHaveBeenCalled();
    });

    it('la franja de lectura va de debajo de la barra (64 px) al 40 % de la pantalla', async () => {
        const spy = stubObserver();
        await mountShow();

        expect(spy.instances).toHaveLength(1);
        expect(spy.instances[0]?.options).toEqual({ rootMargin: '-64px 0px -60% 0px' });
    });

    it('al desmontar la ficha, deja de mirar las secciones', async () => {
        const spy = stubObserver();
        const { wrapper } = await mountShow();

        expect(spy.instances[0]?.disconnect).not.toHaveBeenCalled();

        wrapper.unmount();

        expect(spy.instances[0]?.disconnect).toHaveBeenCalled();
    });
});
