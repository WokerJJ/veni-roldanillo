import type { Component, FunctionalComponent, Ref } from 'vue';
import { h, nextTick, ref, shallowRef } from 'vue';

export interface LazyDialog {
    /** Lo que se pone en la plantilla, con `v-if="open"`: nada mientras no bajó. */
    Dialog: FunctionalComponent;
    open: Ref<boolean>;
    /** Lo baja con import() la primera vez y lo abre. */
    show: () => void;
    /** Lo cierra y, cuando ya no está, devuelve el foco con `focusBack`. */
    close: () => Promise<void>;
}

/**
 * Un diálogo que baja con import() recién cuando se pide (#16): así no pesa
 * en el chunk de quien lo abre. Lo usan la lista del inicio y el carrito para
 * «Guardado en este teléfono». Si no baja (sin señal y sin la PWA guardada),
 * lo dice en la consola y el botón queda para volver a intentarlo.
 */
export function useLazyDialog(load: () => Promise<{ default: Component }>, where: string, focusBack: () => void): LazyDialog {
    const component = shallowRef<Component | null>(null);
    const open = ref(false);
    const Dialog: FunctionalComponent = (_props, { attrs }) => (component.value === null ? null : h(component.value, attrs));

    /** Si ya bajó (una función: TypeScript no arrastra el null a la promesa). */
    function loaded(): boolean {
        return component.value !== null;
    }

    function show(): void {
        if (loaded()) {
            open.value = true;

            return;
        }

        load()
            .then((module) => {
                component.value = module.default;
                open.value = true;
            })
            .catch((error: unknown) => {
                console.error(`[${where}] No se pudo abrir lo guardado en el teléfono.`, error);
            });
    }

    async function close(): Promise<void> {
        open.value = false;
        await nextTick();
        focusBack();
    }

    return { Dialog, open, show, close };
}
