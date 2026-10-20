import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RouteProfile, RouteState } from '@/routing/directions';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

const LA_CEIBA: [number, number] = [-76.1547, 4.4128];
const READY: RouteState = { status: 'ready', routes: { foot: { distance: 940, duration: 752 }, car: { distance: 940, duration: 135 } } };

async function mountDirections(state: RouteState, { profile = 'foot', locale = 'es' }: { profile?: RouteProfile; locale?: 'es' | 'en' } = {}) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: RouteDirections } = await import('./RouteDirections.vue');
    const host = document.createElement('div');
    document.body.append(host);
    const wrapper = mount(RouteDirections, { props: { state, profile, destination: LA_CEIBA }, attachTo: host });

    return {
        wrapper,
        status: () => wrapper.get('[data-route-status]').text().replaceAll(' ', ' '),
        option: (name: RouteProfile) => wrapper.get(`[data-profile="${name}"]`),
        retry: () => wrapper.findAll('button').find((button) => ['Volver a intentar', 'Try again'].includes(button.text())),
    };
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

afterEach(() => {
    document.body.replaceChildren();
});

describe('RouteDirections', () => {
    it('al abrirse, el foco va a su título', async () => {
        const { wrapper } = await mountDirections({ status: 'locating' });

        expect(document.activeElement).toBe(wrapper.get('h3').element);
        expect(wrapper.get('h3').text()).toBe('Cómo llegar');
    });

    it('con la ruta, a pie y en carro con su duración y distancia, y que es una estimación', async () => {
        const { option, status, wrapper } = await mountDirections(READY);

        expect(option('foot').text().replaceAll(' ', ' ')).toBe('A pie13 min · 940 m');
        expect(option('car').text().replaceAll(' ', ' ')).toBe('En carro3 min · 940 m');
        expect(option('foot').attributes('aria-pressed')).toBe('true');
        expect(option('car').attributes('aria-pressed')).toBe('false');
        expect(status()).toBe('A pie: unos 13 min (940 m).');
        expect(wrapper.get('[data-estimate]').text()).toContain('estimados');
    });

    it('en inglés', async () => {
        const { status, wrapper } = await mountDirections(READY, { profile: 'car', locale: 'en' });

        expect(status()).toBe('By car: about 3 min (940 m).');
        expect(wrapper.get('[data-estimate]').text()).toContain('estimates');
        expect(wrapper.get('[data-google-maps]').text()).toBe('Google Maps');
        expect(wrapper.get('[data-attribution] a').text()).toBe('© OpenStreetMap contributors (ODbL)');
    });

    it('tocar en carro lo pide a la página', async () => {
        const { option, wrapper } = await mountDirections(READY);

        await option('car').trigger('click');

        expect(wrapper.emitted('profile')).toEqual([['car']]);
    });

    it('si con un perfil no hay ruta, lo dice en ese', async () => {
        const { option } = await mountDirections({ status: 'ready', routes: { foot: { distance: 940, duration: 752 }, car: null } });

        expect(option('car').text()).toBe('En carroSin ruta así');
    });

    it.each([
        [{ status: 'locating' }, 'Buscando tu ubicación', false],
        [{ status: 'calculating' }, 'Calculando la ruta', false],
        [{ status: 'no-route' }, 'No encontramos una ruta', true],
        [{ status: 'far' }, 'Estás lejos de las calles del mapa', true],
        [{ status: 'outside' }, 'Estás fuera de la zona del mapa', true],
        [{ status: 'offline' }, 'parece que estás sin señal', true],
        [{ status: 'denied' }, 'Sin permiso para ver tu ubicación', true],
        [{ status: 'signal' }, 'no consigue señal de ubicación', true],
        [{ status: 'unsupported' }, 'Este navegador no puede darnos tu ubicación', false],
        [{ status: 'off' }, 'Apagaste «¿Dónde estoy?»', true],
        [{ status: 'unavailable' }, 'Sin el mapa', false],
        [{ status: 'destination-far' }, 'Este restaurante está lejos de las calles del mapa', false],
        [{ status: 'error' }, 'No podemos calcular rutas', false],
    ] as [RouteState, string, boolean][])('%o: lo dice, y «Volver a intentar» solo si sirve', async (state, text, retry) => {
        const { status, retry: retryButton, wrapper } = await mountDirections(state);

        expect(status()).toContain(text);
        expect(retryButton() !== undefined).toBe(retry);
        expect(wrapper.find('[data-estimate]').exists()).toBe(false);
    });

    it('«Volver a intentar» lo pide a la página', async () => {
        const { retry, wrapper } = await mountDirections({ status: 'offline' });

        await retry()?.trigger('click');

        expect(wrapper.emitted('retry')).toHaveLength(1);
    });

    it('los enlaces a Google Maps y Waze llevan solo el destino y abren aparte', async () => {
        const { wrapper } = await mountDirections(READY, { profile: 'car' });
        const google = wrapper.get('[data-google-maps]');
        const waze = wrapper.get('[data-waze]');

        expect(google.attributes('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=4.4128%2C-76.1547&travelmode=driving');
        expect(waze.attributes('href')).toBe('https://waze.com/ul?ll=4.4128%2C-76.1547&navigate=yes');

        for (const link of [google, waze]) {
            expect(link.attributes('target')).toBe('_blank');
            expect(link.attributes('rel')).toBe('noopener noreferrer');
            expect(link.classes()).toContain('min-h-touch');
        }
    });

    it('dice de dónde salen las calles: OpenStreetMap', async () => {
        const { wrapper } = await mountDirections(READY);

        expect(wrapper.text()).toContain('© colaboradores de OpenStreetMap');
    });

    it('nombra la licencia de los datos y enlaza a su página', async () => {
        const { wrapper } = await mountDirections(READY);
        const link = wrapper.get('[data-attribution] a');

        expect(link.text()).toBe('© colaboradores de OpenStreetMap (ODbL)');
        expect(link.attributes('href')).toBe('https://www.openstreetmap.org/copyright');
        expect(link.attributes('target')).toBe('_blank');
        expect(link.attributes('rel')).toBe('noopener noreferrer');
    });

    it('los dos enlaces a otras apps van en una fila, para que el panel tape menos', async () => {
        const { wrapper } = await mountDirections(READY);

        expect(wrapper.get('[data-google-maps]').element.parentElement?.classList).toContain('grid-cols-2');
        expect(wrapper.get('[data-google-maps]').text()).toBe('Google Maps');
        expect(wrapper.get('[data-waze]').text()).toBe('Waze');
    });

    it('su botón de cerrar tiene nombre y 44 px', async () => {
        const { wrapper } = await mountDirections(READY);
        const close = wrapper.get('button[aria-label="Ocultar la ruta"]');

        await close.trigger('click');

        expect(close.classes()).toContain('size-touch');
        expect(wrapper.emitted('close')).toHaveLength(1);
    });
});
