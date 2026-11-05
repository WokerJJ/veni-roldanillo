import type { Ref } from 'vue';
import { onBeforeUnmount, ref } from 'vue';

/** Desde este ancho el inicio va con la barra lateral fija y el mapa al lado (ADR 0037): el `lg` de Tailwind. */
export const DESKTOP_QUERY = '(min-width: 64rem)';

/**
 * Si la ventana cumple `query` ahora, y cada vez que cambia (girar la
 * tableta, agrandar la ventana). Se lee al llamarla, antes del primer
 * pintado: la página no arranca con un diseño y salta al otro.
 */
export function useMediaQuery(query: string): Readonly<Ref<boolean>> {
    const media = window.matchMedia(query);
    const matches = ref(media.matches);
    const update = (event: MediaQueryListEvent): void => {
        matches.value = event.matches;
    };

    media.addEventListener('change', update);
    onBeforeUnmount(() => {
        media.removeEventListener('change', update);
    });

    return matches;
}
