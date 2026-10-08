import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ref } from 'vue';
import { defineComponent } from 'vue';

import { useNow } from './useNow';

const NOON = new Date('2026-10-07T12:00:00-05:00');

function mountClock(intervalMs?: number) {
    const used: { now?: Readonly<Ref<Date>> } = {};
    const wrapper = mount(
        defineComponent({
            setup() {
                used.now = useNow(intervalMs);

                return () => null;
            },
        }),
    );

    if (!used.now) {
        throw new Error('El componente no montó.');
    }

    return { wrapper, now: used.now };
}

function setVisibility(state: 'visible' | 'hidden'): void {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
    document.dispatchEvent(new Event('visibilitychange'));
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOON);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('useNow', () => {
    it('empieza en la hora del momento', () => {
        const { now } = mountClock();

        expect(now.value).toEqual(NOON);
    });

    it('se pone al día sola cada medio minuto', () => {
        const { now } = mountClock();

        vi.advanceTimersByTime(29_000);
        expect(now.value).toEqual(NOON);

        vi.advanceTimersByTime(1_000);
        expect(now.value).toEqual(new Date('2026-10-07T12:00:30-05:00'));
    });

    it('el intervalo se puede cambiar', () => {
        const { now } = mountClock(5_000);

        vi.advanceTimersByTime(5_000);

        expect(now.value).toEqual(new Date('2026-10-07T12:00:05-05:00'));
    });

    it('al volver la pestaña del fondo se pone al día sin esperar al reloj', () => {
        const { now } = mountClock();
        vi.setSystemTime(new Date('2026-10-07T15:10:00-05:00'));

        setVisibility('visible');

        expect(now.value).toEqual(new Date('2026-10-07T15:10:00-05:00'));
    });

    it('al irse al fondo no hace nada', () => {
        const { now } = mountClock();
        vi.setSystemTime(new Date('2026-10-07T15:10:00-05:00'));

        setVisibility('hidden');

        expect(now.value).toEqual(NOON);
    });

    it('al desmontar deja de correr: ni reloj ni oyente', () => {
        const { wrapper, now } = mountClock();
        wrapper.unmount();
        vi.setSystemTime(new Date('2026-10-07T15:10:00-05:00'));

        vi.advanceTimersByTime(60_000);
        setVisibility('visible');

        expect(now.value).toEqual(NOON);
        expect(vi.getTimerCount()).toBe(0);
    });
});
