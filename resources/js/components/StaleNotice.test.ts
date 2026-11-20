import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

const NOW = new Date('2026-10-07T12:00:00-05:00').getTime();

async function mountNotice(since: number, locale: 'es' | 'en' = 'es', extra: { answered?: boolean; busy?: boolean } = {}) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: StaleNotice } = await import('./StaleNotice.vue');

    return mount(StaleNotice, { props: { since, ...extra } });
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('StaleNotice', () => {
    it('dice de hace cuánto son los datos, como estado, no como alerta', async () => {
        const wrapper = await mountNotice(NOW - 2 * 3_600_000);
        const notice = wrapper.get('[data-stale]');

        expect(notice.attributes('role')).toBe('status');
        expect(notice.text()).toContain('Sin señal: datos de hace 2 horas');
    });

    it('en inglés', async () => {
        const wrapper = await mountNotice(NOW - 3 * 86_400_000, 'en');

        expect(wrapper.text()).toContain('No signal: data from 3 days ago');
    });

    it('«Reintentar» avisa para que se vuelva a pedir la lista', async () => {
        const wrapper = await mountNotice(NOW - 60_000);

        await wrapper.get('[data-stale-retry]').trigger('click');

        expect(wrapper.emitted('retry')).toHaveLength(1);
    });

    it('con respuesta de error del servidor, no dice «sin señal» (BUG-005)', async () => {
        const wrapper = await mountNotice(NOW - 2 * 3_600_000, 'es', { answered: true });

        expect(wrapper.text()).toContain('No pudimos actualizar: datos de hace 2 horas');
        expect(wrapper.text()).not.toContain('Sin señal');
    });

    it('mientras reintenta, el botón se desactiva, queda ocupado y lo dice (EVA-015)', async () => {
        const wrapper = await mountNotice(NOW - 60_000, 'es', { busy: true });
        const button = wrapper.get('[data-stale-retry]');

        expect(button.attributes('disabled')).toBeDefined();
        expect(button.attributes('aria-busy')).toBe('true');
        expect(button.text()).toBe('Reintentando…');
    });

    it('el tiempo se actualiza solo con los minutos', async () => {
        const wrapper = await mountNotice(NOW - 60_000);
        expect(wrapper.text()).toContain('hace 1 minuto');

        vi.advanceTimersByTime(10 * 60_000);
        await wrapper.vm.$nextTick();

        expect(wrapper.text()).toContain('hace 11 minutos');
    });
});
