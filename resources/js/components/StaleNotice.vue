<script setup lang="ts">
import { computed } from 'vue';

import { useI18n } from '@/composables/useI18n';
import { useNow } from '@/composables/useNow';
import { agoText } from '@/restaurants/savedList';

/**
 * El aviso de que la lista de restaurantes es la última que llegó a este
 * teléfono (#144, ADR 0046): «Sin señal: datos de hace 2 horas», con
 * «Reintentar». Sale sobre el mapa mientras la lista es la guardada; con la
 * señal de vuelta (o al reintentar) llega la de verdad y el aviso se va solo.
 *
 * Es contenido, no un control flotante: sólido, no de vidrio. Baja aparte del
 * arranque, con los demás componentes del inicio (components/links.ts). Los
 * estilos van aquí, con alcance, y no en la hoja de estilos del arranque.
 */
const { since } = defineProps<{ since: number }>();
const emit = defineEmits<{ retry: [] }>();

const { t, locale } = useI18n();
const now = useNow(60_000);

const time = computed(() => agoText(since, now.value.getTime(), locale.value));
</script>

<template>
    <div role="status" class="stale-notice" data-stale>
        <span class="stale-text">{{ t('restaurants.stale', { time }) }}</span>
        <button type="button" class="stale-retry" data-stale-retry @click="emit('retry')">{{ t('restaurants.retry') }}</button>
    </div>
</template>

<style scoped>
/* Debajo de la fila de arriba del mapa (el crédito y la ubicación: 10 px + 44 px), con el margen del sistema. */
.stale-notice {
    position: absolute;
    z-index: 10;
    top: calc(env(safe-area-inset-top, 0px) + 4.25rem);
    right: 0.5rem;
    left: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.25rem 0.25rem 1rem;
    border: 1px solid var(--color-line);
    border-radius: var(--veni-radius-lg);
    color: var(--color-ink);
    background: var(--color-canvas);
    box-shadow: 0 1px 2px var(--color-line);
    font-size: 0.875rem;
    line-height: 1.25rem;
}

.stale-text {
    flex: 1;
    min-width: 0;
}

.stale-retry {
    flex-shrink: 0;
    min-height: var(--veni-touch-min);
    padding: 0 1rem;
    /* Concéntrico: radio del aviso (22) menos su relleno (4). */
    border-radius: calc(var(--veni-radius-lg) - 0.25rem);
    font-weight: 700;
    color: var(--color-veni-blanco);
    background: var(--color-veni-ciruela);
}

@media (prefers-reduced-motion: no-preference) {
    .stale-retry {
        transition:
            opacity 160ms cubic-bezier(0.2, 0, 0, 1),
            scale 160ms cubic-bezier(0.2, 0, 0, 1);
    }

    .stale-retry:active {
        scale: 0.97;
    }
}

.stale-retry:active {
    opacity: 0.85;
}

:global([data-theme='dark']) .stale-retry {
    color: var(--color-veni-ciruela);
    background: var(--color-veni-mango);
}

/* En computador, la barra lateral ocupa la izquierda: el aviso va arriba, al centro del mapa. */
@media (min-width: 64rem) {
    .stale-notice {
        top: 1rem;
        right: auto;
        left: calc(50% + 11rem);
        width: max-content;
        max-width: 30rem;
        translate: -50% 0;
    }
}
</style>
