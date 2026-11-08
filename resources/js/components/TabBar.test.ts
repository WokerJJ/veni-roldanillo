import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { homeList, homeListRequest, type HomeList, published, resetHomeList } from '@/navigation/tabs';
import type { OrderItem } from '@/order/selection';
import { saveCart } from '@/order/storage';
import { cartRequest, resetOrders, useOrder } from '@/order/useOrder';
import { restaurantUrl } from '@/restaurants/links';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

const JUICE: OrderItem = { dish: 'Jugo de prueba', unitPrice: 4000, quantity: 1, choices: [], removed: [], note: null };

/** La barra en `url`, con la lista del inicio como diga `list`. */
async function mountBar({ url = '/', list = false, immersive = false, locale = 'es' }: { url?: string; list?: HomeList; immersive?: boolean; locale?: 'es' | 'en' } = {}) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });
    inertia.page.url = url;
    const visit = vi.fn();
    Object.assign(inertia.router, { visit });

    homeList.value = list;
    const { default: TabBar } = await import('./TabBar.vue');
    const wrapper = mount(TabBar, { props: { immersive }, attachTo: document.body });

    return { wrapper, visit, tab: (name: string) => wrapper.get(`[data-tab="${name}"]`) };
}

enableAutoUnmount(afterEach);

afterEach(() => {
    vi.restoreAllMocks();
    resetOrders();
    resetHomeList();
    document.body.replaceChildren();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
});

/** El CSS de la barra, como texto. */
const css = readFileSync(join(__dirname, 'TabBar.vue'), 'utf8').split('<style scoped>')[1] ?? '';

describe('TabBar (#139, ADR 0041)', () => {
    it('es una navegación con nombre, con enlaces reales en orden: Mapa, Lista, Guía, Pedido y buscar', async () => {
        const { wrapper } = await mountBar();
        const nav = wrapper.get('nav');

        expect(nav.attributes('aria-label')).toBe('Secciones');
        expect(nav.findAll('[data-tab]').map((tab) => [tab.attributes('data-tab'), tab.element.tagName, tab.attributes('href')])).toEqual([
            ['map', 'A', '/'],
            ['list', 'A', '/'],
            ['dishes', 'A', '/dishes'],
            ['order', 'SPAN', undefined],
            ['search', 'A', '/'],
        ]);
        expect(wrapper.get('[data-tab="search"]').attributes('aria-label')).toBe('Buscar');
    });

    it.each([
        ['/', false, 'map'],
        ['/', 'heading', 'list'],
        ['/', 'search', 'list'],
        ['/dishes', false, 'dishes'],
        ['/restaurants/prueba-la-ceiba', false, null],
    ] as const)('en %s, con la lista %s, marca «%s» con aria-current', async (url, list, current) => {
        const { wrapper } = await mountBar({ url, list });

        expect(wrapper.findAll('[aria-current="page"]').map((tab) => tab.attributes('data-tab'))).toEqual(current === null ? [] : [current]);
    });

    it.each([
        ['map', 'heading', false],
        ['list', false, 'heading'],
        ['search', false, 'search'],
    ] as const)('en el inicio no recarga: «%s» con la lista %s pide %s', async (name, list, next) => {
        const { tab, visit } = await mountBar({ list });

        await tab(name).trigger('click', { button: 0 });

        expect(homeList.value).toBe(next);
        expect(homeListRequest.value).toBe(1);
        expect(visit).not.toHaveBeenCalled();
    });

    it('pedir lo mismo que ya se ve también cuenta como orden (BUG-049)', async () => {
        const { tab } = await mountBar({ list: 'search' });

        await tab('search').trigger('click', { button: 0 });
        await tab('search').trigger('click', { button: 0 });

        expect(homeList.value).toBe('search');
        expect(homeListRequest.value).toBe(2);
    });

    it('desde otra página, las pestañas del inicio piden lo suyo y van al inicio; «Guía», a la guía', async () => {
        const { tab, visit } = await mountBar({ url: '/restaurants/prueba-la-ceiba' });
        const asked: HomeList[] = [];
        const record = () => asked.push(homeList.value);

        await tab('list').trigger('click', { button: 0 });
        record();
        await tab('search').trigger('click', { button: 0 });
        record();
        await tab('map').trigger('click', { button: 0 });
        record();
        await tab('dishes').trigger('click', { button: 0 });

        expect(asked).toEqual(['heading', 'search', false]);
        expect(visit.mock.calls).toEqual([['/'], ['/'], ['/'], ['/dishes']]);
    });

    it('con Ctrl o el botón del medio deja al navegador abrir otra pestaña', async () => {
        const { tab, visit } = await mountBar({ url: '/dishes' });

        await tab('list').trigger('click', { button: 0, ctrlKey: true });
        await tab('map').trigger('click', { button: 1 });

        expect(homeListRequest.value).toBe(0);
        expect(visit).not.toHaveBeenCalled();
    });

    describe('Pedido', () => {
        it.each([
            ['es', 'Pedido', 'Pedido, todavía no tenés platos'],
            ['en', 'Order', 'Order, no dishes yet'],
        ] as const)('en %s, sin pedido no es un control: «%s» a la vista y la frase entera para el lector (EVA-069)', async (locale, shown, spoken) => {
            const { tab } = await mountBar({ locale });
            const order = tab('order');

            expect(order.element.tagName).toBe('SPAN');
            // aria-disabled en un <span> genérico no lo anuncia ningún lector.
            expect(order.attributes('aria-disabled')).toBeUndefined();
            expect(order.get('[data-order-label]').attributes('aria-hidden')).toBe('true');
            expect(order.get('[data-order-label]').text()).toBe(shown);
            expect(order.get('.sr-only').text()).toBe(spoken);
            expect(order.find('[data-order-count]').exists()).toBe(false);
        });

        it.each([
            ['es', 1, 'Pedido, 1 plato'],
            ['es', 3, 'Pedido, 3 platos'],
            ['en', 3, 'Order, 3 dishes'],
        ] as const)('en %s, con %s, cuenta los platos del último pedido: «%s»', async (locale, quantity, name) => {
            saveCart('prueba-la-ceiba', [{ ...JUICE, quantity }]);
            const { tab } = await mountBar({ locale });

            // La dirección escrita en la barra es la de restaurants/links.ts.
            expect(tab('order').attributes('href')).toBe(restaurantUrl('prueba-la-ceiba'));
            expect(tab('order').attributes('aria-label')).toBe(name);
            expect(tab('order').get('[data-order-count]').text()).toBe(String(quantity));
        });

        it('el contador sigue al pedido mientras se agregan platos', async () => {
            const { tab } = await mountBar();

            useOrder('prueba-la-ceiba').add(JUICE);
            await flushPromises();
            expect(tab('order').get('[data-order-count]').text()).toBe('1');

            useOrder('prueba-la-ceiba').add({ ...JUICE, quantity: 2 });
            await flushPromises();
            expect(tab('order').get('[data-order-count]').text()).toBe('3');
        });

        it('desde otra página va a la ficha y le pide abrir el carrito', async () => {
            useOrder('prueba-la-ceiba').add(JUICE);
            const { tab, visit } = await mountBar({ url: '/dishes' });

            await tab('order').trigger('click', { button: 0 });

            expect(visit).toHaveBeenCalledWith('/restaurants/prueba-la-ceiba', expect.anything());
            expect(cartRequest.value).toBe('prueba-la-ceiba');
        });

        it('con la lista publicada a la vista, no ofrece el pedido de un restaurante que ya no está (BUG-051)', async () => {
            saveCart('prueba-la-ceiba', [JUICE], Date.now() - 2000);
            saveCart('prueba-oculta', [JUICE], Date.now() - 1000);

            // Sin la lista (otra página, sin señal), el último pedido.
            expect((await mountBar()).tab('order').attributes('href')).toBe('/restaurants/prueba-oculta');

            published.value = [{ slug: 'prueba-la-ceiba' }];
            await flushPromises();
            expect((await mountBar()).tab('order').attributes('href')).toBe('/restaurants/prueba-la-ceiba');

            published.value = [];
            await flushPromises();
            expect((await mountBar()).tab('order').attributes('href')).toBeUndefined();
        });

        it('si la ficha del pedido ya no existe (404), olvida ese carrito (BUG-051)', async () => {
            useOrder('prueba-la-ceiba').add(JUICE);
            const { tab, visit } = await mountBar({ url: '/dishes' });
            visit.mockImplementation((_url: string, options?: { onHttpException?: (response: { status: number }) => unknown }) => {
                expect(options?.onHttpException?.({ status: 404 })).not.toBe(false);
            });

            await tab('order').trigger('click', { button: 0 });
            await flushPromises();

            expect(visit).toHaveBeenCalledOnce();
            expect(useOrder('prueba-la-ceiba').count.value).toBe(0);
            expect(localStorage.getItem('veni:cart:prueba-la-ceiba')).toBeNull();
            expect(tab('order').attributes('href')).toBeUndefined();
        });

        it('si la visita a la ficha termina sin que la ficha lo tome (falló), no queda el pedido de abrir el carrito (BUG-054)', async () => {
            useOrder('prueba-la-ceiba').add(JUICE);
            const { tab, visit } = await mountBar({ url: '/dishes' });
            visit.mockImplementation((_url: string, options?: { onFinish?: () => void }) => {
                options?.onFinish?.();
            });

            await tab('order').trigger('click', { button: 0 });

            expect(visit).toHaveBeenCalledOnce();
            expect(cartRequest.value).toBeNull();
        });

        it('en la ficha de ese pedido le pide abrir el carrito, sin tocar el DOM de la ficha (EVA-067)', async () => {
            useOrder('prueba-la-ceiba').add(JUICE);
            const open = vi.fn();
            const button = document.createElement('button');
            button.dataset.openCart = '';
            button.addEventListener('click', open);
            document.body.append(button);
            const { tab, visit } = await mountBar({ url: '/restaurants/prueba-la-ceiba' });

            await tab('order').trigger('click', { button: 0 });

            expect(cartRequest.value).toBe('prueba-la-ceiba');
            expect(open).not.toHaveBeenCalled();
            expect(visit).not.toHaveBeenCalled();
        });
    });

    describe('en una página larga', () => {
        async function scrollTo(y: number) {
            Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
            window.dispatchEvent(new Event('scroll'));
            await flushPromises();
        }

        it('se esconde al bajar, vuelve al subir y avisa a la barra del pedido', async () => {
            const { wrapper } = await mountBar({ url: '/dishes' });
            const nav = wrapper.get('nav');

            await scrollTo(400);
            expect(nav.attributes('data-hidden')).toBe('true');
            expect(document.documentElement.hasAttribute('data-tabbar-hidden')).toBe(true);

            // Un temblor del dedo no la trae.
            await scrollTo(396);
            expect(nav.attributes('data-hidden')).toBe('true');

            await scrollTo(300);
            expect(nav.attributes('data-hidden')).toBeUndefined();
            expect(document.documentElement.hasAttribute('data-tabbar-hidden')).toBe(false);
        });

        it('arriba del todo no se esconde, y vuelve si algo de adentro recibe el foco', async () => {
            const { wrapper } = await mountBar({ url: '/dishes' });
            const nav = wrapper.get('nav');

            await scrollTo(40);
            expect(nav.attributes('data-hidden')).toBeUndefined();

            await scrollTo(500);
            expect(nav.attributes('data-hidden')).toBe('true');
            await wrapper.get('[data-tab="map"]').trigger('focusin');
            expect(nav.attributes('data-hidden')).toBeUndefined();
        });

        it('al volver con el historial no se esconde por el desplazamiento que restaura Inertia (BUG-050)', async () => {
            const frames: FrameRequestCallback[] = [];
            vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));
            const runFrame = () => { frames.splice(0).forEach((callback) => { callback(0); }); };
            const { wrapper } = await mountBar({ url: '/dishes' });
            const nav = wrapper.get('nav');
            const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;

            inertia.restoreFromHistory('es');
            // Inertia lleva la página a donde estaba: no es la persona bajando.
            await scrollTo(900);
            expect(nav.attributes('data-hidden')).toBeUndefined();

            runFrame();
            runFrame();
            await flushPromises();
            expect(nav.attributes('data-hidden')).toBeUndefined();

            // Desde ahí, bajar la esconde como siempre (cuenta desde 900, no desde 0).
            await scrollTo(904);
            expect(nav.attributes('data-hidden')).toBeUndefined();
            await scrollTo(1000);
            expect(nav.attributes('data-hidden')).toBe('true');
        });

        it('al irse quita el aviso de <html>', async () => {
            const { wrapper } = await mountBar({ url: '/dishes' });
            await scrollTo(500);

            wrapper.unmount();
            expect(document.documentElement.hasAttribute('data-tabbar-hidden')).toBe(false);
        });
    });

    it('fuera del mapa deja un espaciador de su alto; en el mapa no', async () => {
        expect((await mountBar({ immersive: false })).wrapper.find('.tabbar-spacer').exists()).toBe(true);
        expect((await mountBar({ immersive: true })).wrapper.find('.tabbar-spacer').exists()).toBe(false);
    });

    describe('su CSS', () => {
        it('solo por debajo de 1024 px: en computador no se ve (ADR 0037)', () => {
            expect(css).toMatch(/@media \(min-width: 64rem\) \{\s*\.tabbar,\s*\.tabbar-spacer \{\s*display: none;/);
        });

        it('vidrio solo donde el navegador lo hace, y sólido con «Reducir transparencia»', () => {
            expect(css).toMatch(/\.tabbar-glass \{[^}]*background: var\(--color-canvas\);/);
            expect(css).toMatch(/@supports \(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\) \{\s*\.tabbar-glass \{[^}]*color-mix\(in srgb, var\(--color-canvas\) 88%, transparent\)/);
            expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\) \{\s*\.tabbar-glass \{\s*background: var\(--color-canvas\);[^}]*backdrop-filter: none;/);
        });

        it('se desliza solo sin «Reducir movimiento», y respeta el margen del iPhone', () => {
            const motion = /@media \(prefers-reduced-motion: no-preference\) \{\s*\.tabbar \{[^}]*\}\s*\}/.exec(css)?.[0] ?? '';

            expect(motion).toContain('transition-property: translate;');
            // Ninguna transición fuera de esa regla; la lista a pantalla completa (#139) solo apaga la del panel.
            expect(css.split('transition-property: none;')).toHaveLength(2);
            expect(css.replace('transition-property: none;', '').split('transition-').length).toBe(motion.split('transition-').length);
            expect(css).toContain('calc(0.5rem + env(safe-area-inset-bottom))');
        });

        it('cada pestaña mide al menos 44 px de alto (48) y el botón de buscar 56', () => {
            expect(css).toMatch(/\.tabbar-tab \{[^}]*min-height: 3rem;/);
            expect(css).toMatch(/\.tabbar-search \{[^}]*width: 3\.5rem;\s*height: 3\.5rem;/);
        });
    });
});
