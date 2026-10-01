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

function createPage() {
    const props: FakePageProps = { locale: 'es', translations: { ...es } };

    return reactive({ props });
}

/**
 * Página actual. reset() la reemplaza por otra: los watchers que dejaron
 * pruebas anteriores siguen mirando la vieja y no se cruzan con la nueva.
 */
export let page = createPage();

export const router = {
    put: vi.fn(),
};

export function usePage() {
    return page;
}

/** Página nueva en español y router sin llamadas, como al cargar la app. */
export function reset(): void {
    page = createPage();
    router.put.mockReset();
}
