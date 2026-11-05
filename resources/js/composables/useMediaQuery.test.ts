import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import { desktopWidth, phoneWidth, stubMedia } from '@/testing/media';

import { DESKTOP_QUERY, useMediaQuery } from './useMediaQuery';

function mountProbe(query: string) {
    return mount(
        defineComponent({
            setup() {
                const matches = useMediaQuery(query);

                return () => h('p', matches.value ? 'sí' : 'no');
            },
        }),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
    it('lee la consulta al llamarla, antes del primer pintado', () => {
        const { matchMedia } = stubMedia(desktopWidth);

        expect(mountProbe(DESKTOP_QUERY).text()).toBe('sí');
        expect(matchMedia).toHaveBeenCalledWith('(min-width: 64rem)');
    });

    it('sigue los cambios de ancho de la ventana', async () => {
        const media = stubMedia(phoneWidth);
        const wrapper = mountProbe(DESKTOP_QUERY);
        expect(wrapper.text()).toBe('no');

        media.change(desktopWidth);
        await wrapper.vm.$nextTick();
        expect(wrapper.text()).toBe('sí');

        media.change(phoneWidth);
        await wrapper.vm.$nextTick();
        expect(wrapper.text()).toBe('no');
    });

    it('deja de escuchar al desmontarse', () => {
        const media = stubMedia(phoneWidth);
        const wrapper = mountProbe(DESKTOP_QUERY);
        expect(media.listeners.size).toBe(1);

        wrapper.unmount();
        expect(media.listeners.size).toBe(0);
    });
});
