import { vi } from 'vitest';

type Listener = (event: MediaQueryListEvent) => void;

/**
 * Un matchMedia de mentira y controlable: `matches` dice qué consultas se
 * cumplen al empezar; `change` cambia el ancho de la ventana (girar la
 * tableta, agrandar la ventana) y avisa a quien escucha cada consulta, como
 * el navegador. Se deshace con `vi.unstubAllGlobals()`.
 */
export function stubMedia(matches: (query: string) => boolean = () => false) {
    /** Quién escucha, con la consulta que escucha. */
    const listeners = new Map<Listener, string>();
    let current = matches;
    const matchMedia = vi.fn((query: string) => ({
        get matches() {
            return current(query);
        },
        media: query,
        addEventListener: vi.fn((_type: string, listener: Listener) => listeners.set(listener, query)),
        removeEventListener: vi.fn((_type: string, listener: Listener) => listeners.delete(listener)),
    }));
    vi.stubGlobal('matchMedia', matchMedia);

    return {
        matchMedia,
        listeners,
        /** Desde ahora se cumplen las consultas que diga `next`. */
        change: (next: (query: string) => boolean) => {
            current = next;
            for (const [listener, query] of listeners) {
                listener({ matches: next(query), media: query } as MediaQueryListEvent);
            }
        },
    };
}

/** La consulta del computador (DESKTOP_QUERY de composables/useMediaQuery.ts, ADR 0037). */
const DESKTOP = '(min-width: 64rem)';

/** El ancho de un computador: desde 1024 px. */
export const desktopWidth = (query: string): boolean => query === DESKTOP;

/** El de un celular: ninguna consulta de ancho se cumple. */
export const phoneWidth = (): boolean => false;
