<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { MAX_FAVORITES, useFavorites } from '@/saved/favorites';

/**
 * Marcar un restaurante como favorito (#16, ADR 0032), en la ficha y en el
 * resumen del mapa. Es un botón de alternar (`aria-pressed`) con un nombre
 * que no cambia: el lector dice «Favorito, presionado» o «no presionado», y
 * el cambio se anuncia en una región de estado. Lo marcado queda solo en
 * este teléfono (saved/favorites.ts): no hay ninguna petición.
 *
 * El corazón se rellena al marcarlo, además del estado que lee el lector:
 * no depende solo del color (WCAG 1.4.1).
 */
/** `compact`: solo el corazón, en un botón redondo de 44 px; el nombre accesible sigue siendo «Favorito» (#139). */
const { slug, name, compact } = defineProps<{ slug: string; name: string; compact?: boolean }>();

const { t } = useI18n();
const favorites = useFavorites();
const pressed = computed(() => favorites.slugs.value.includes(slug));
const announcement = ref('');
const FILLED = { fill: 'currentColor' };

async function toggle(): Promise<void> {
    const before = pressed.value;
    const now = favorites.toggle(slug);
    announcement.value = '';
    await nextTick();

    if (!before && !now) {
        announcement.value = t('favorites.full', { max: MAX_FAVORITES });
    } else {
        announcement.value = t(now ? 'favorites.added' : 'favorites.removed', { name });
    }
}
</script>

<template>
    <span class="inline-flex">
        <button
            type="button"
            class="inline-flex min-h-touch items-center gap-2 rounded-full border border-line font-semibold hover:bg-surface"
            :class="compact ? 'size-touch shrink-0 justify-center' : 'px-4'"
            :aria-label="compact ? t('favorites.button') : undefined"
            :aria-pressed="pressed"
            data-favorite
            @click="toggle"
        >
            <!-- Relleno con estilo en línea (CSSOM, permitido por la CSP) y no con CSS propio: un chunk de estilos más en las dependencias del arranque. -->
            <Icon name="corazon" :size="20" :style="pressed ? FILLED : undefined" />
            <template v-if="!compact">{{ t('favorites.button') }}</template>
        </button>
        <span role="status" class="sr-only" data-favorite-status>{{ announcement }}</span>
    </span>
</template>
