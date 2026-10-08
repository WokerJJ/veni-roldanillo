import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

async function mountBadge(locale: 'es' | 'en') {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: SampleDataBadge } = await import('./SampleDataBadge.vue');

    return mount(SampleDataBadge);
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

describe('SampleDataBadge', () => {
    it.each([
        ['es', 'Datos de ejemplo'],
        ['en', 'Sample data'],
    ] as const)('en %s dice «%s»', async (locale, text) => {
        const wrapper = await mountBadge(locale);

        expect(wrapper.text()).toBe(text);
    });

    it('usa ciruela sobre mango: el texto pequeño no va en arrebol', async () => {
        const wrapper = await mountBadge('es');

        expect(wrapper.classes()).toEqual(expect.arrayContaining(['bg-veni-mango', 'text-veni-ciruela']));
    });
});
