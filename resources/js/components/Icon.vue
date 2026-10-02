<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';

import type { IconArt, IconName } from '@/icons/icons';
import { loadIcon, readyIcon } from '@/icons/icons';

/**
 * Ícono de colombia-icons (ADR 0011). Hereda el color del texto
 * (`currentColor`) y es decorativo salvo que lleve `label`: úsalo sin
 * etiqueta junto a un texto o dentro de un botón que ya tiene nombre, y con
 * etiqueta cuando el ícono es lo único que dice algo. Una etiqueta en blanco
 * no nombra nada: cuenta como no tenerla.
 *
 * El tamaño va en píxeles con `size` o con clases (`class="size-5"`), que
 * ganan sobre los atributos. Sirve también para el color: `class="text-veni-mango"`.
 *
 * v-html con contenido de confianza (por eso eslint.config.js permite aquí
 * vue/no-v-html): el dibujo es un archivo del repositorio, copiado de una
 * versión fija y validado contra una lista blanca de elementos y atributos por
 * `icons-sync.mjs --check` en cada corrida de pruebas. Su sha256 en el
 * manifiesto prueba que el archivo y el manifiesto coinciden, no de dónde
 * salió: que sea idéntico al del origen lo comprueba `icons-sync.mjs --verify`.
 * Nunca es un dato del usuario ni del servidor: `name` solo elige entre esos
 * archivos. La plantilla no lleva comentarios: en desarrollo serían nodos
 * hermanos del <svg> y el componente dejaría de tener una sola raíz.
 */
const props = withDefaults(
    defineProps<{
        name: IconName;
        size?: number;
        label?: string;
    }>(),
    { size: 24, label: '' },
);

const art = shallowRef<IconArt>();
const accessibleName = computed(() => props.label.trim());

watch(
    () => props.name,
    (name, _previous, onCleanup) => {
        art.value = readyIcon(name);

        if (art.value) {
            return;
        }

        let current = true;
        let waitingForNetwork = false;

        // Mientras llega queda vacío, con su tamaño (sin saltos) y su nombre accesible.
        const load = (): void => {
            waitingForNetwork = false;

            loadIcon(name).then(
                (loaded) => {
                    // El nombre pudo cambiar mientras llegaba: gana el último.
                    if (current) {
                        art.value = loaded;
                    }
                },
                (error: unknown) => {
                    // Sin red, o un nombre que llegó como dato y se saltó los tipos.
                    if (import.meta.env.DEV) {
                        console.warn(`[icons] ${error instanceof Error ? error.message : String(error)}`);
                    }

                    // Un intento más cada vez que vuelve la red, nunca por su cuenta.
                    if (current && typeof window !== 'undefined') {
                        waitingForNetwork = true;
                        window.addEventListener('online', load, { once: true });
                    }
                },
            );
        };

        // Al cambiar el nombre o desmontar: ni pinta el que llegue tarde ni sigue esperando la red.
        onCleanup(() => {
            current = false;

            if (waitingForNetwork) {
                window.removeEventListener('online', load);
            }
        });

        load();
    },
    { immediate: true },
);
</script>

<template>
    <svg
        v-bind="art?.attributes"
        :data-icon="name"
        :width="size"
        :height="size"
        :role="accessibleName ? 'img' : undefined"
        :aria-label="accessibleName || undefined"
        :aria-hidden="accessibleName ? undefined : 'true'"
        focusable="false"
        v-html="art?.body"
    />
</template>
