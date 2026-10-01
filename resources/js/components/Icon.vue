<script setup lang="ts">
import { shallowRef, watch } from 'vue';

import type { IconArt, IconName } from '@/icons/icons';
import { loadIcon, readyIcon } from '@/icons/icons';

/**
 * Ícono de colombia-icons (ADR 0011). Hereda el color del texto
 * (`currentColor`) y es decorativo salvo que lleve `label`: úsalo sin
 * etiqueta junto a un texto o dentro de un botón que ya tiene nombre, y con
 * etiqueta cuando el ícono es lo único que dice algo.
 *
 * El tamaño va en píxeles con `size` o con clases (`class="size-5"`), que
 * ganan sobre los atributos. Sirve también para el color: `class="text-veni-mango"`.
 *
 * v-html con contenido de confianza (por eso eslint.config.js permite aquí
 * vue/no-v-html): el dibujo es un archivo del repositorio, copiado de una
 * versión fija, con su sha256 en el manifiesto y validado contra una lista
 * blanca de elementos y atributos por `icons-sync.mjs --check` en cada corrida
 * de pruebas. Nunca es un dato del usuario ni del servidor: `name` solo elige
 * entre esos archivos. La plantilla no lleva comentarios: en desarrollo serían
 * nodos hermanos del <svg> y el componente dejaría de tener una sola raíz.
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

watch(
    () => props.name,
    (name) => {
        art.value = readyIcon(name);

        if (art.value) {
            return;
        }

        // Mientras llega queda vacío, con su tamaño (sin saltos) y su nombre accesible.
        loadIcon(name).then(
            (loaded) => {
                // El nombre pudo cambiar mientras llegaba: gana el último.
                if (props.name === name) {
                    art.value = loaded;
                }
            },
            (error: unknown) => {
                // Sin red, o un nombre que llegó como dato y se saltó los tipos.
                if (import.meta.env.DEV) {
                    console.warn(`[icons] ${error instanceof Error ? error.message : String(error)}`);
                }
            },
        );
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
        :role="label ? 'img' : undefined"
        :aria-label="label || undefined"
        :aria-hidden="label ? undefined : 'true'"
        focusable="false"
        v-html="art?.body"
    />
</template>
