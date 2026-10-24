import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import type { OrderItem } from '@/order/selection';
import { resetOrders, useOrder } from '@/order/useOrder';
import type { RestaurantProfile } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';
import { nth } from '@/testing/present';

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

    it('«Recordar» guarda barrio, dirección, referencia y nombre en el dispositivo, nunca la ubicación; «Borrar» los quita', async () => {
        stubCurrentPosition({ latitude: 4.41, longitude: -76.15, accuracy: 10 });
        const { wrapper } = await mountCart();

        await wrapper.get('[data-address]').setValue('Cra 5 #8-20');
        await wrapper.get('[data-location-add]').trigger('click');
        await wrapper.get('[data-payment="cash"]').setValue(true);
        await wrapper.get('[data-cash]').setValue('50000');
        expect(window.localStorage.getItem('veni:delivery:prueba-la-ceiba')).toBeNull();

        await wrapper.get('[data-remember]').setValue(true);
        await wrapper.get('[data-reference]').setValue('casa azul');
        await flushPromises();

        const saved = window.localStorage.getItem('veni:delivery:prueba-la-ceiba') ?? '';
        expect(saved).toContain('Cra 5 #8-20');
        expect(saved).toContain('casa azul');
        expect(saved).not.toContain('4.41');
        expect(saved).not.toContain('cash');
        expect(saved).not.toContain('50000');
        expect(saved).not.toContain('50.000');

        await wrapper.get('[data-forget]').trigger('click');
        await flushPromises();
        expect(window.localStorage.getItem('veni:delivery:prueba-la-ceiba')).toBeNull();
        expect((wrapper.get('[data-address]').element as HTMLInputElement).value).toBe('');
        expect(wrapper.get('[data-announcement]').text()).toBe('Se borraron los datos guardados en este teléfono.');
    });

    it('al abrir de nuevo, trae los datos recordados', async () => {
        window.localStorage.setItem(
            'veni:delivery:prueba-la-ceiba',
            JSON.stringify({ v: 1, savedAt: Date.now(), data: { mode: 'delivery', neighborhood: 'El Mirador (ficticio)', address: 'Cra 5', reference: 'casa azul', name: 'Ana' } }),
        );
        const { wrapper } = await mountCart();

        expect((wrapper.get('[data-address]').element as HTMLInputElement).value).toBe('Cra 5');
        expect((wrapper.get('[data-remember]').element as HTMLInputElement).checked).toBe(true);
        expect(plain(wrapper.get('[data-fee]').text())).toBe('$ 1.500');
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
