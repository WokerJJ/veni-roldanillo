import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProfileImage, ProfilePromotion } from '@/restaurants/profile';
import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/*
| Las fotos de los platos y promociones (#113, ADR 0034): todas del mismo
| tamaño, con srcset, sin mover el diseño y sin pedirse antes de tiempo.
*/

enableAutoUnmount(afterEach);

const PHOTO: ProfileImage = {
    src: '/storage/media/dishes/0123456789abcdef0123-480.webp',
    srcset: '/storage/media/dishes/0123456789abcdef0123-160.webp 160w, /storage/media/dishes/0123456789abcdef0123-480.webp 480w, /storage/media/dishes/0123456789abcdef0123-960.webp 960w',
};

async function receive(locale: 'es' | 'en' = 'es'): Promise<void> {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });
}

describe('DishPhoto', () => {
    it('la miniatura pide el ancho que le sirve, reserva su lugar y espera a verse', async () => {
        await receive();
        const { default: DishPhoto } = await import('./DishPhoto.vue');
        const img = mount(DishPhoto, { props: { image: PHOTO, alt: '', size: 'thumb' } }).get('img');

        expect(img.attributes()).toMatchObject({
            src: PHOTO.src,
            srcset: PHOTO.srcset,
            sizes: '64px',
            width: '64',
            height: '64',
            alt: '',
            loading: 'lazy',
            decoding: 'async',
        });
    });

    it('la grande lleva el nombre del plato como texto alternativo', async () => {
        await receive();
        const { default: DishPhoto } = await import('./DishPhoto.vue');
        const img = mount(DishPhoto, { props: { image: PHOTO, alt: 'Sancocho de prueba', size: 'large' } }).get('img');

        expect(img.attributes('alt')).toBe('Sancocho de prueba');
        expect(img.attributes('sizes')).toBe('(min-width: 32rem) 28rem, 100vw');
        expect([img.attributes('width'), img.attributes('height')]).toEqual(['480', '480']);
    });

    it('sin foto, el mismo cuadro con un ícono que el lector de pantalla no lee', async () => {
        await receive();
        const { default: DishPhoto } = await import('./DishPhoto.vue');
        const wrapper = mount(DishPhoto, { props: { image: null, alt: '', size: 'thumb' } });
        await flushPromises();

        expect(wrapper.find('img').exists()).toBe(false);
        expect(wrapper.attributes('data-photo')).toBe('placeholder');
        expect(wrapper.classes()).toContain('dish-photo-thumb');
        expect(wrapper.find('[aria-hidden="true"]').exists()).toBe(true);
    });
});

describe('RestaurantPromotions', () => {
    const PROMOTIONS: ProfilePromotion[] = [
        {
            title: 'Jugo gratis con el sancocho (prueba)',
            ends_at: '2026-10-07T22:00:00-05:00',
            image: {
                src: '/storage/media/promotions/abcdefabcdefabcdef01-640.webp',
                srcset: '/storage/media/promotions/abcdefabcdefabcdef01-320.webp 320w, /storage/media/promotions/abcdefabcdefabcdef01-640.webp 640w, /storage/media/promotions/abcdefabcdefabcdef01-1280.webp 1280w',
            },
        },
        { title: 'Sin imagen (prueba)', ends_at: '2026-10-09T12:00:00-05:00', image: null },
    ];

    it('cada promoción con su imagen 16:9, el título escrito y hasta cuándo vale', async () => {
        await receive();
        const { default: RestaurantPromotions } = await import('./RestaurantPromotions.vue');
        const wrapper = mount(RestaurantPromotions, { props: { promotions: PROMOTIONS } });
        const [first, second] = wrapper.findAll('[data-promotion]');

        expect(wrapper.get('h2').text()).toBe('Promociones');
        expect(first?.get('img').attributes()).toMatchObject({ width: '640', height: '360', sizes: '18rem', alt: '', loading: 'lazy', decoding: 'async' });
        expect(first?.text()).toContain('Jugo gratis con el sancocho (prueba)');
        expect(first?.text()).toContain('Hasta el miércoles, 7 de octubre');
        expect(second?.find('img').exists()).toBe(false);
        expect(second?.text()).toContain('Sin imagen (prueba)');
    });
});
