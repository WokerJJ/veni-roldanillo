import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import type { OrderItem } from '@/order/selection';
import type { AddressFields } from '@/saved/addresses';
import { ADDRESSES_KEY, MAX_ADDRESSES, resetAddressBook, useAddressBook } from '@/saved/addresses';
import { resetOrders, useOrder } from '@/order/useOrder';
import type { RestaurantProfile } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';
import { nth } from '@/testing/present';
import { quotaExceeded, spyStorage } from '@/testing/storage';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

type CartRestaurant = Pick<RestaurantProfile, 'slug' | 'name' | 'whatsapp' | 'delivery' | 'payment_methods'>;

const RESTAURANT: CartRestaurant = {
    slug: 'prueba-la-ceiba',
    name: 'La Ceiba (prueba)',
    whatsapp: '570000722116',
    delivery: {
        available: true,
        notes: null,
        zones: [
            { neighborhood: 'El Mirador (ficticio)', fee: 1500 },
            { neighborhood: 'La Esquina Lila (ficticio)', fee: 2000 },
        ],
    },
    payment_methods: ['cash', 'nequi'],
};

const SANCOCHO: OrderItem = {
    dish: 'Sancocho de prueba',
    unitPrice: 20000,
    quantity: 2,
    choices: [
        { group: 'Proteína (prueba)', name: 'Cerdo (prueba)', price: 1000 },
        { group: 'Adiciones (prueba)', name: 'Huevo (prueba)', price: 500 },
    ],
    removed: ['Cebolla (prueba)'],
    note: 'bien caliente',
};
const JUICE: OrderItem = { dish: 'Jugo de prueba', unitPrice: 4000, quantity: 1, choices: [], removed: [], note: null };
const HOME: AddressFields = { label: { kind: 'home', text: '' }, neighborhood: 'El Mirador (ficticio)', address: '', reference: '', name: 'Ana' };

/** Los espacios que no parten la línea («$ 18.500») como uno común. */
function plain(text: string): string {
    return text.replace(/\p{Zs}/gu, ' ');
}

async function mountCart(restaurant: CartRestaurant = RESTAURANT, items: OrderItem[] = [SANCOCHO, JUICE], locale: 'es' | 'en' = 'es') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const order = useOrder(restaurant.slug);
    items.forEach((item) => order.add(item));

    const { default: OrderCart } = await import('./OrderCart.vue');
    const wrapper = mount(OrderCart, { props: { restaurant }, attachTo: document.body });

    return {
        wrapper,
        order,
        lines: () => wrapper.findAll('[data-line]'),
        href: () => wrapper.find('[data-send]').attributes('href') ?? null,
        message: () => {
            const href = wrapper.find('[data-send]').attributes('href');

            return href === undefined ? null : plain(new URL(href).searchParams.get('text') ?? '');
        },
        total: () => plain(wrapper.get('[data-total]').text()),
    };
}

/**
 * Un clic en «Enviar»: devuelve si el carrito lo frenó. Después, un oyente en
 * el documento lo frena siempre, para que la prueba no navegue a wa.me.
 */
async function clickSend(link: HTMLElement): Promise<boolean> {
    let prevented = false;
    const stop = (event: Event): void => {
        prevented = event.defaultPrevented;
        event.preventDefault();
    };
    document.addEventListener('click', stop, { once: true });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushPromises();

    return prevented;
}

function stubCurrentPosition(result: { latitude: number; longitude: number; accuracy: number } | { code: number }) {
    const getCurrentPosition = vi.fn((success: PositionCallback, error?: PositionErrorCallback | null) => {
        if ('code' in result) {
            error?.({ code: result.code, message: 'x', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
        } else {
            success({ coords: { ...result, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: 0 } as unknown as GeolocationPosition);
        }
    });
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    onTestFinished(() => {
        Reflect.deleteProperty(navigator, 'geolocation');
    });

    return getCurrentPosition;
}

enableAutoUnmount(afterEach);

afterEach(() => {
    resetOrders();
    resetAddressBook();
    window.localStorage.clear();
});

describe('OrderCart', () => {
    it('abre como diálogo modal con el foco en el título y muestra cada línea con opciones, quitados y nota', async () => {
        const { wrapper, lines } = await mountCart();

        expect(wrapper.get('dialog').element.open).toBe(true);
        expect(document.activeElement).toBe(wrapper.get('h2').element);
        expect(lines()).toHaveLength(2);

        const first = nth(lines(), 0);
        expect(first.text()).toContain('Sancocho de prueba');
        expect(first.get('[data-line-details]').text()).toBe('Cerdo (prueba) · Huevo (prueba) · Sin Cebolla (prueba)');
        expect(first.get('[data-line-note]').text()).toBe('Nota: bien caliente');
        expect(plain(first.get('[data-line-price]').text())).toBe('$ 40.000');
    });

    it('cambia cantidades, quita líneas y vacía con confirmación, y lo anuncia', async () => {
        const { wrapper, lines, order } = await mountCart();

        await nth(lines(), 1).get('[data-increase]').trigger('click');
        expect(order.items.value[1]?.quantity).toBe(2);
        expect(nth(lines(), 1).get('[data-decrease]').attributes('aria-label')).toBe('Una menos de Jugo de prueba');

        await nth(lines(), 0).get('[data-remove]').trigger('click');
        await flushPromises();
        expect(lines()).toHaveLength(1);
        expect(wrapper.get('[data-announcement]').text()).toBe('Sancocho de prueba salió del pedido.');
        expect(document.activeElement).toBe(wrapper.get('h2').element);

        await wrapper.get('[data-clear]').trigger('click');
        expect(wrapper.get('[data-clear-confirm]').text()).toBe('¿Vaciás todo el pedido?');
        await wrapper.get('[data-clear-no]').trigger('click');
        expect(lines()).toHaveLength(1);

        await wrapper.get('[data-clear]').trigger('click');
        await wrapper.get('[data-clear-yes]').trigger('click');
        await flushPromises();
        expect(order.count.value).toBe(0);
        expect(wrapper.find('[data-empty]').exists()).toBe(true);
        expect(wrapper.find('[data-send]').exists()).toBe(false);
    });

    it('cada línea conserva su elemento al quitar otra: la cantidad no se anuncia de más', async () => {
        const { lines } = await mountCart();
        const juiceQuantity = nth(lines(), 1).get('[data-quantity]').element;

        await nth(lines(), 0).get('[data-remove]').trigger('click');
        await flushPromises();

        expect(lines()).toHaveLength(1);
        expect(nth(lines(), 0).get('[data-quantity]').element).toBe(juiceQuantity);
    });

    it('el total estimado suma el domicilio del barrio elegido', async () => {
        const { wrapper, total } = await mountCart();

        expect(plain(wrapper.get('[data-fee]').text())).toBe('Elegí el barrio');
        expect(total()).toBe('$ 44.000 + domicilio');

        await wrapper.get('[data-neighborhood]').setValue('La Esquina Lila (ficticio)');
        expect(plain(wrapper.get('[data-fee]').text())).toBe('$ 2.000');
        expect(total()).toBe('$ 46.000');

        await wrapper.get('[data-mode="pickup"]').setValue(true);
        expect(wrapper.find('[data-fee]').exists()).toBe(false);
        expect(wrapper.find('[data-address]').exists()).toBe(false);
        expect(total()).toBe('$ 44.000');
    });

    it('sin zonas, el barrio se escribe y el domicilio queda por confirmar', async () => {
        const { wrapper, total } = await mountCart({ ...RESTAURANT, delivery: { available: true, notes: null, zones: [] } });

        expect(wrapper.get('[data-neighborhood]').element.tagName).toBe('INPUT');
        expect(wrapper.get('[data-fee]').text()).toBe('Por confirmar');
        expect(total()).toBe('$ 44.000 + domicilio');
    });

    it('si falta algo, «Enviar» no abre WhatsApp: marca cada campo, lo anuncia y lleva el foco al primero', async () => {
        const { wrapper } = await mountCart();

        // Mientras falta algo no es un enlace: no se puede abrir, copiar ni mantener presionado.
        const send = wrapper.get('[data-send]');
        expect(send.element.tagName).toBe('BUTTON');
        expect(send.attributes('href')).toBeUndefined();
        expect(send.attributes('type')).toBe('button');

        const prevented = await clickSend(send.element as HTMLElement);

        expect(prevented).toBe(true);
        expect(wrapper.findAll('[data-error]').map((error) => error.text())).toEqual(['Elegí tu barrio.', 'Escribí la dirección.', 'Elegí cómo pagás.']);
        expect(wrapper.get('[data-alert]').text()).toBe('Revisá lo que falta antes de enviar.');
        expect(document.activeElement).toBe(wrapper.get('[data-neighborhood]').element);
        expect(wrapper.get('[data-address]').attributes('aria-invalid')).toBe('true');
        expect(wrapper.get('[data-address]').attributes('aria-describedby')).toContain('-address-error');
    });

    it('con todo lo necesario, el enlace es wa.me del restaurante con el mensaje del pedido', async () => {
        const { wrapper, href, message } = await mountCart();

        await wrapper.get('[data-neighborhood]').setValue('El Mirador (ficticio)');
        await wrapper.get('[data-address]').setValue('Cra 5 #8-20');
        await wrapper.get('[data-reference]').setValue('casa azul frente a la tienda');
        await wrapper.get('[data-name]').setValue('Ana');
        await wrapper.get('[data-payment="cash"]').setValue(true);
        await wrapper.get('[data-cash]').setValue('50.000');

        expect(href()).toMatch(/^https:\/\/wa\.me\/570000722116\?text=/);
        expect(message()).toBe(
            [
                'Hola, quiero hacer un pedido desde Vení Roldanillo:',
                '• 2 × Sancocho de prueba + Cerdo (prueba) + Huevo (prueba), sin Cebolla (prueba) — $ 40.000',
                '   Nota: bien caliente',
                '• 1 × Jugo de prueba — $ 4.000',
                '',
                'Platos: $ 44.000',
                'Domicilio (El Mirador (ficticio)): $ 1.500',
                'Total estimado: $ 45.500',
                '',
                'Para domicilio',
                'Barrio: El Mirador (ficticio)',
                'Dirección: Cra 5 #8-20',
                'Referencia: casa azul frente a la tienda',
                'Nombre: Ana',
                'Pago: Efectivo, pago con $ 50.000',
            ].join('\n'),
        );

        const link = wrapper.get('[data-send]');
        expect(link.element.tagName).toBe('A');
        expect(link.attributes('target')).toBe('_blank');
        expect(link.attributes('rel')).toBe('noopener noreferrer');
        expect(await clickSend(link.element as HTMLElement)).toBe(false);
    });

    it('«¿con cuánto pagás?» sale solo con efectivo y avisa si no es un valor o no alcanza', async () => {
        const { wrapper } = await mountCart(RESTAURANT, [JUICE]);

        await wrapper.get('[data-mode="pickup"]').setValue(true);
        await wrapper.get('[data-payment="nequi"]').setValue(true);
        expect(wrapper.find('[data-cash]').exists()).toBe(false);

        await wrapper.get('[data-payment="cash"]').setValue(true);
        await wrapper.get('[data-cash]').setValue('mucho');
        await clickSend(wrapper.get('[data-send]').element as HTMLElement);
        expect(wrapper.get('[data-field="cash"] [data-error]').text()).toBe('Escribí el valor en pesos, solo números.');

        await wrapper.get('[data-cash]').setValue('2000');
        expect(plain(wrapper.get('[data-field="cash"] [data-error]').text())).toBe('Con eso no alcanza para el total estimado ($ 4.000).');
    });

    it('la ubicación se pide solo al tocar el botón y va únicamente en el mensaje, sin pedir nada a la red', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const getCurrentPosition = stubCurrentPosition({ latitude: 4.412812, longitude: -76.154734, accuracy: 18.4 });
        const { wrapper, message } = await mountCart();
        await wrapper.get('[data-neighborhood]').setValue('El Mirador (ficticio)');
        await wrapper.get('[data-address]').setValue('Cra 5 #8-20');
        await wrapper.get('[data-payment="nequi"]').setValue(true);

        expect(getCurrentPosition).not.toHaveBeenCalled();
        expect(message()).not.toContain('📍');

        await wrapper.get('[data-location-add]').trigger('click');
        await flushPromises();

        expect(getCurrentPosition).toHaveBeenCalledOnce();
        expect(wrapper.get('[data-location-added]').text()).toBe('Ubicación agregada, con un margen de 18 m.');
        expect(message()?.split('\n').at(-1)).toBe('📍 Ubicación: https://www.google.com/maps/search/?api=1&query=4.41281,-76.15473');
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(JSON.stringify(Object.keys(window.localStorage).map((key) => window.localStorage.getItem(key)))).not.toContain('4.41');
        expect(window.location.href).not.toContain('4.41');

        await wrapper.get('[data-location-remove]').trigger('click');
        expect(message()).not.toContain('📍');
    });

    it('sin permiso para la ubicación lo dice y se puede pedir igual', async () => {
        stubCurrentPosition({ code: 1 });
        const { wrapper } = await mountCart();

        await wrapper.get('[data-location-add]').trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-location-error]').text()).toBe('No diste permiso para usar tu ubicación. Podés pedir sin ella.');
        expect(wrapper.find('[data-location-added]').exists()).toBe(false);
    });

    it('«Guardar esta dirección» la guarda en la libreta del teléfono, nunca la ubicación ni el pago; «Borrar» la quita', async () => {
        stubCurrentPosition({ latitude: 4.41, longitude: -76.15, accuracy: 10 });
        const { wrapper } = await mountCart();

        await wrapper.get('[data-address]').setValue('Cra 5 #8-20');
        await wrapper.get('[data-location-add]').trigger('click');
        await wrapper.get('[data-payment="cash"]').setValue(true);
        await wrapper.get('[data-cash]').setValue('50000');
        expect(window.localStorage.getItem(ADDRESSES_KEY)).toBeNull();

        await wrapper.get('[data-remember]').setValue(true);
        await flushPromises();
        // Una dirección nueva se guarda al marcar; lo que cambie después, al enviar.
        expect(useAddressBook().addresses.value).toMatchObject([{ address: 'Cra 5 #8-20', reference: '', label: { kind: 'home' } }]);

        await wrapper.get('[data-label-kind="work"]').setValue(true);
        await wrapper.get('[data-reference]').setValue('casa azul');
        await wrapper.get('[data-neighborhood]').setValue('El Mirador (ficticio)');
        await flushPromises();
        expect(useAddressBook().addresses.value).toMatchObject([{ reference: '', label: { kind: 'home' } }]);

        await clickSend(wrapper.get('[data-send]').element as HTMLElement);

        const saved = window.localStorage.getItem(ADDRESSES_KEY) ?? '';
        expect(saved).toContain('Cra 5 #8-20');
        expect(saved).toContain('casa azul');
        expect(saved).toContain('"kind":"work"');
        expect(saved).not.toContain('4.41');
        expect(saved).not.toContain('cash');
        expect(saved).not.toContain('50000');
        expect(saved).not.toContain('50.000');
        // Nada por restaurante: la libreta es una sola.
        expect(window.localStorage.getItem('veni:delivery:prueba-la-ceiba')).toBeNull();

        await wrapper.get('[data-forget]').trigger('click');
        await flushPromises();
        expect(window.localStorage.getItem(ADDRESSES_KEY)).toBeNull();
        expect((wrapper.get('[data-address]').element as HTMLInputElement).value).toBe('');
        expect(wrapper.get('[data-announcement]').text()).toBe('Se borró la dirección de este teléfono.');
    });

    it('precargar «Casa» no marca la casilla; desmarcarla no la borra de la libreta', async () => {
        useAddressBook().save({ ...HOME, address: 'Cra 5' });
        const before = useAddressBook().addresses.value;
        const { wrapper } = await mountCart();

        expect((wrapper.get('[data-remember]').element as HTMLInputElement).checked).toBe(false);

        await wrapper.get('[data-remember]').setValue(true);
        await wrapper.get('[data-remember]').setValue(false);
        await flushPromises();

        expect(useAddressBook().addresses.value).toEqual(before);
        expect((wrapper.get('[data-address]').element as HTMLInputElement).value).toBe('Cra 5');
    });

    it('editar «Casa» no la cambia en la libreta hasta enviar el pedido, y solo con la casilla marcada', async () => {
        useAddressBook().save({ ...HOME, address: 'Cra 5' });
        const { wrapper } = await mountCart();
        await wrapper.get('[data-payment="nequi"]').setValue(true);

        await wrapper.get('[data-address]').setValue('Calle 7');
        await clickSend(wrapper.get('[data-send]').element as HTMLElement);
        expect(useAddressBook().addresses.value).toMatchObject([{ address: 'Cra 5' }]);

        await wrapper.get('[data-remember]').setValue(true);
        await wrapper.get('[data-address]').setValue('Calle 8');
        await flushPromises();
        expect(useAddressBook().addresses.value).toMatchObject([{ address: 'Cra 5' }]);

        await clickSend(wrapper.get('[data-send]').element as HTMLElement);
        expect(useAddressBook().addresses.value).toMatchObject([{ label: { kind: 'home' }, address: 'Calle 8' }]);
    });

    it('al recoger no se escribe nada en la libreta', async () => {
        useAddressBook().save({ ...HOME, address: 'Cra 5' }, null, Date.now() - 60_000);
        const before = useAddressBook().addresses.value;
        const { wrapper } = await mountCart();

        await wrapper.get('[data-remember]').setValue(true);
        await wrapper.get('[data-address]').setValue('Calle 8');
        await wrapper.get('[data-mode="pickup"]').setValue(true);
        await wrapper.get('[data-payment="nequi"]').setValue(true);
        const { setItem, restore } = spyStorage();
        onTestFinished(restore);

        expect(await clickSend(wrapper.get('[data-send]').element as HTMLElement)).toBe(false);

        expect(setItem.mock.calls.filter(([key]) => key === ADDRESSES_KEY)).toEqual([]);
        expect(useAddressBook().addresses.value).toEqual(before);
    });

    it('enviar el pedido marca la dirección como usada: la próxima vez se abre con ella', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        onTestFinished(() => {
            vi.useRealTimers();
        });
        vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
        const older = useAddressBook().save({ ...HOME, address: 'Calle vieja' }, null, Date.now() - 60_000);
        useAddressBook().save({ ...HOME, label: { kind: 'work', text: '' }, address: 'Cra 5' });
        const first = await mountCart();

        expect((first.wrapper.get('[data-address]').element as HTMLInputElement).value).toBe('Cra 5');
        await first.wrapper.get(`[data-saved-address="${String(older)}"]`).setValue(true);
        await first.wrapper.get('[data-payment="nequi"]').setValue(true);
        vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
        await clickSend(first.wrapper.get('[data-send]').element as HTMLElement);

        expect(useAddressBook().addresses.value[0]).toMatchObject({ id: older, address: 'Calle vieja', usedAt: Date.now() });
        first.wrapper.unmount();

        const second = await mountCart(RESTAURANT, []);
        expect((second.wrapper.get('[data-address]').element as HTMLInputElement).value).toBe('Calle vieja');
    });

    it('al abrir, trae la dirección usada más recientemente, en cualquier restaurante', async () => {
        useAddressBook().save({ ...HOME, address: 'Calle vieja' }, null, Date.now() - 60_000);
        useAddressBook().save({ ...HOME, label: { kind: 'work', text: '' }, address: 'Cra 5' });
        const { wrapper } = await mountCart();

        expect((wrapper.get('[data-address]').element as HTMLInputElement).value).toBe('Cra 5');
        expect((wrapper.get('[data-name]').element as HTMLInputElement).value).toBe('Ana');
        expect((wrapper.get('[data-remember]').element as HTMLInputElement).checked).toBe(false);
        expect(plain(wrapper.get('[data-fee]').text())).toBe('$ 1.500');
        expect(wrapper.findAll('[data-saved-addresses] .font-semibold').map((node) => node.text())).toEqual(['Tus direcciones', 'Trabajo', 'Casa', 'Editar o borrar tus direcciones']);
    });

    it('lo que «Recordar» guardaba por restaurante (#15) pasa a la libreta y se borra de donde estaba', async () => {
        window.localStorage.setItem(
            'veni:delivery:prueba-la-ceiba',
            JSON.stringify({ v: 1, savedAt: Date.now(), data: { mode: 'delivery', neighborhood: 'El Mirador (ficticio)', address: 'Cra 5', reference: 'casa azul', name: 'Ana' } }),
        );
        const { wrapper } = await mountCart();

        expect((wrapper.get('[data-address]').element as HTMLInputElement).value).toBe('Cra 5');
        expect((wrapper.get('[data-remember]').element as HTMLInputElement).checked).toBe(false);
        expect(plain(wrapper.get('[data-fee]').text())).toBe('$ 1.500');
        expect(window.localStorage.getItem('veni:delivery:prueba-la-ceiba')).toBeNull();
        expect(useAddressBook().addresses.value).toMatchObject([{ label: { kind: 'home' }, address: 'Cra 5', reference: 'casa azul', name: 'Ana' }]);
    });

    it('lo de #15 no se borra si no entró en la libreta llena', async () => {
        const legacy = JSON.stringify({ v: 1, savedAt: Date.now(), data: { mode: 'delivery', neighborhood: 'El Mirador (ficticio)', address: 'Cra 99', reference: '', name: 'Ana' } });
        Array.from({ length: MAX_ADDRESSES }, (_, index) => useAddressBook().save({ ...HOME, address: `Calle ${String(index)}` }));
        window.localStorage.setItem('veni:delivery:prueba-la-ceiba', legacy);
        await mountCart();

        expect(window.localStorage.getItem('veni:delivery:prueba-la-ceiba')).toBe(legacy);
        expect(useAddressBook().addresses.value).toHaveLength(MAX_ADDRESSES);
    });

    it('lo de #15 no se borra si la libreta no se pudo escribir', async () => {
        const legacy = JSON.stringify({ v: 1, savedAt: Date.now(), data: { mode: 'delivery', neighborhood: 'El Mirador (ficticio)', address: 'Cra 99', reference: '', name: 'Ana' } });
        window.localStorage.setItem('veni:delivery:prueba-la-ceiba', legacy);
        const { setItem, restore } = spyStorage();
        setItem.mockImplementation(quotaExceeded);
        onTestFinished(restore);
        await mountCart(RESTAURANT, []);

        expect(window.localStorage.getItem('veni:delivery:prueba-la-ceiba')).toBe(legacy);
    });

    it('elegir una de la libreta completa el formulario; un barrio que no es de este restaurante se pide de la lista sin perderlo', async () => {
        useAddressBook().save({ ...HOME, label: { kind: 'other', text: 'Donde mi mamá' }, neighborhood: 'Otro barrio', address: 'Calle 9', reference: '' }, null, Date.now() - 60_000);
        useAddressBook().save({ ...HOME, address: 'Cra 5' });
        const { wrapper } = await mountCart();
        const other = useAddressBook().addresses.value[1];

        await wrapper.get(`[data-saved-address="${String(other?.id)}"]`).setValue(true);
        await flushPromises();

        expect((wrapper.get('[data-address]').element as HTMLInputElement).value).toBe('Calle 9');
        expect((wrapper.get('[data-neighborhood]').element as HTMLSelectElement).value).toBe('');
        expect(wrapper.get('[data-neighborhood-missing]').text()).toContain('«Otro barrio» no está entre los barrios');
        expect(wrapper.get('[data-neighborhood]').attributes('aria-describedby')).toContain('-neighborhood-saved');
        expect(wrapper.get('[data-announcement]').text()).toBe('Se completó con «Donde mi mamá». Revisá los datos antes de enviar.');
        // Sigue guardado con su barrio: el vacío del formulario no lo pisa.
        expect(useAddressBook().addresses.value.find(({ id }) => id === other?.id)?.neighborhood).toBe('Otro barrio');

        await wrapper.get('[data-saved-other]').setValue(true);
        await flushPromises();

        expect((wrapper.get('[data-address]').element as HTMLInputElement).value).toBe('');
        expect((wrapper.get('[data-remember]').element as HTMLInputElement).checked).toBe(false);
        expect(useAddressBook().addresses.value).toHaveLength(2);
    });

    it('con la libreta llena no guarda otra y lo dice', async () => {
        Array.from({ length: MAX_ADDRESSES }, (_, index) => useAddressBook().save({ ...HOME, address: `Calle ${String(index)}` }));
        const { wrapper } = await mountCart();

        await wrapper.get('[data-saved-other]').setValue(true);
        await wrapper.get('[data-address]').setValue('Cra 5');
        await wrapper.get('[data-remember]').setValue(true);
        await flushPromises();

        expect((wrapper.get('[data-remember]').element as HTMLInputElement).checked).toBe(false);
        expect(wrapper.get('[data-remember-full]').text()).toBe('Ya tenés 10 direcciones guardadas: borrá una para guardar otra.');
        expect(useAddressBook().addresses.value).toHaveLength(MAX_ADDRESSES);
    });

    it('«Editar o borrar tus direcciones» abre lo guardado encima del carrito; borrar la que está en uso deja el formulario sin guardar', async () => {
        useAddressBook().save({ ...HOME, address: 'Cra 5' });
        const { wrapper } = await mountCart();

        await wrapper.get('[data-saved-manage]').trigger('click');
        await flushPromises();
        await vi.waitFor(() => {
            expect(wrapper.find('[data-saved]').exists()).toBe(true);
        });

        // Desde el carrito no van los favoritos: no tiene los nombres de los restaurantes.
        expect(wrapper.find('[data-favorites-title]').exists()).toBe(false);

        // «Borrar todo lo guardado» se hace desde el inicio, no desde un pedido.
        expect(wrapper.find('[data-clear-all]').exists()).toBe(false);

        await wrapper.get('[data-address-delete]').trigger('click');
        await flushPromises();

        expect((wrapper.get('[data-remember]').element as HTMLInputElement).checked).toBe(false);
        expect((wrapper.get('[data-address]').element as HTMLInputElement).value).toBe('Cra 5');

        await wrapper.get('[data-saved] [data-close]').trigger('click');
        await flushPromises();
        expect(wrapper.find('[data-saved]').exists()).toBe(false);
        // Sin direcciones ya no está «Editar o borrar»: el foco va al barrio, no se pierde.
        expect(wrapper.find('[data-saved-manage]').exists()).toBe(false);
        expect(document.activeElement).toBe(wrapper.get('[data-neighborhood]').element);
    });

    it('si el restaurante no tiene WhatsApp, no se ofrece enviar', async () => {
        const { wrapper } = await mountCart({ ...RESTAURANT, whatsapp: null });

        expect(wrapper.find('[data-send]').exists()).toBe(false);
        expect(wrapper.find('[data-order-form]').exists()).toBe(false);
        expect(wrapper.get('[data-no-whatsapp]').text()).toContain('todavía no recibe pedidos por WhatsApp');
        // El carrito sigue: se puede ver y vaciar.
        expect(wrapper.findAll('[data-line]')).toHaveLength(2);
    });

    it('sin domicilio, solo se recoge: no pregunta cómo ni dónde', async () => {
        const { wrapper, message } = await mountCart({ ...RESTAURANT, delivery: { available: false, notes: null, zones: [] }, payment_methods: ['nequi'] });

        expect(wrapper.find('[data-field="mode"]').exists()).toBe(false);
        expect(wrapper.find('[data-address]').exists()).toBe(false);
        expect(message()).toContain('Lo recojo en el local');
        expect(message()).toContain('Pago: Nequi');
    });

    it('en inglés, la interfaz y el mensaje van en inglés', async () => {
        const { wrapper, message } = await mountCart(RESTAURANT, [JUICE], 'en');
        await wrapper.get('[data-mode="pickup"]').setValue(true);
        await wrapper.get('[data-payment="nequi"]').setValue(true);

        expect(wrapper.get('h2').text()).toBe('Your order');
        expect(message()).toContain("Hi, I'd like to place an order from Vení Roldanillo:");
    });

    it('cierra con Escape (cancel) y con el botón', async () => {
        const { wrapper } = await mountCart();

        wrapper.get('dialog').element.dispatchEvent(new Event('cancel', { cancelable: true }));
        await wrapper.get('[data-close]').trigger('click');

        expect(wrapper.emitted('close')).toHaveLength(2);
    });
});
