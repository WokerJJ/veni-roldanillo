/**
 * Doble de @inertiajs/vue3 para Vitest: una página reactiva que las pruebas
 * cambian a mano y un router espiado. Uso:
 *
 *     vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));
 *
 * vi.mock guarda este módulo entre pruebas aunque se llame a
 * vi.resetModules(): cada prueba empieza con reset().
 */
import { vi } from 'vitest';
import { reactive } from 'vue';

import type { Locale } from '@/composables/useI18n';

import en from '../../../lang/en.json';
import es from '../../../lang/es.json';

export const messages = { es, en } as const;

interface FakePageProps {
    locale: Locale;
    translations: Record<string, string>;
}

type FakeEventName = 'beforeUpdate' | 'navigate';
type FakeListener = (event: { detail: { page: { props: FakePageProps } } }) => void;

function createPage() {
    const props: FakePageProps = { locale: 'es', translations: { ...es } };

    return reactive({ props });
}

/**
 * Página actual. reset() la reemplaza por otra: los watchers que dejaron
 * pruebas anteriores siguen mirando la vieja y no se cruzan con la nueva.
 */
export let page = createPage();

let listeners: { type: FakeEventName; callback: FakeListener }[] = [];

export const router = {
    put: vi.fn(),
    reload: vi.fn(),
    on(type: FakeEventName, callback: FakeListener): () => void {
        const listener = { type, callback };
        listeners.push(listener);

        return () => {
            listeners = listeners.filter((registered) => registered !== listener);
        };
    },
};

export function usePage() {
    return page;
}

function fire(type: FakeEventName, props: FakePageProps): void {
    for (const listener of listeners.filter((registered) => registered.type === type)) {
        listener.callback({ detail: { page: { props } } });
    }
}

function show(props: FakePageProps): void {
    page.props.locale = props.locale;
    page.props.translations = props.translations;
}

/**
 * Lo que hace Inertia al recibir una página del servidor: avisa con
 * «beforeUpdate», la muestra y, solo si agrega una entrada al historial (no
 * reemplaza la actual), avisa con «navigate».
 */
export function receiveFromServer(locale: Locale, { replace = false } = {}): void {
    const props: FakePageProps = { locale, translations: { ...messages[locale] } };

    fire('beforeUpdate', props);
    show(props);

    if (!replace) {
        fire('navigate', props);
    }
}

/**
 * Lo que hace Inertia con atrás y adelante: muestra la página que guardó en
 * el historial, sin pedirla al servidor, y avisa con «navigate».
 */
export function restoreFromHistory(locale: Locale): void {
    const props: FakePageProps = { locale, translations: { ...messages[locale] } };

    show(props);
    fire('navigate', props);
}

/** Página nueva en español, sin oyentes y con el router sin llamadas, como al cargar la app. */
export function reset(): void {
    page = createPage();
    listeners = [];
    router.put.mockReset();
    router.reload.mockReset();
}
