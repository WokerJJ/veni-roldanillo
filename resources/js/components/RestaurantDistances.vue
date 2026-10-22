<script lang="ts">
import type { PropType } from 'vue';
import { defineComponent, watch } from 'vue';

import { useMap } from '@/map/useMapLayers';
import type { Restaurant } from '@/restaurants/api';
import { distancesFrom } from '@/restaurants/distance';

/**
 * Las distancias de la lista de restaurantes (#81). Va dentro de `<MapView>`
 * y no pinta nada: recibe la ubicación de «¿Dónde estoy?» en memoria, dentro
 * del dispositivo (como la ruta: ADR 0020), y de ella solo sale `distances`,
 * los metros hasta cada restaurante redondeados a 10. Con «¿Dónde estoy?»
 * apagado, o mientras no hay ubicación, `null`: la lista va sin distancias.
 * No pide la ubicación: la usa si ya está encendida.
 */
export default defineComponent({
    name: 'RestaurantDistances',
    props: {
        restaurants: { type: Array as PropType<readonly Restaurant[]>, required: true },
    },
    emits: {
        distances: (distances: Record<string, number> | null) => distances === null || typeof distances === 'object',
    },
    setup(props, { emit }) {
        const { map } = useMap();
        /** La última ubicación, solo aquí y solo mientras la lista está abierta. */
        let here: [number, number] | null = null;

        function report(): void {
            emit('distances', here === null ? null : distancesFrom(here, props.restaurants));
        }

        watch(
            map,
            (handle, _previous, onCleanup) => {
                here = null;
                report();

                if (handle === null) {
                    return;
                }

                onCleanup(
                    handle.watchPosition((event) => {
                        // Un problema de señal no borra la última: la lista sigue con ella.
                        if (event.type === 'position') {
                            here = event.at;
                            report();
                        } else if (event.type === 'off') {
                            here = null;
                            report();
                        }
                    }),
                );
            },
            { immediate: true },
        );

        watch(() => props.restaurants, report);

        return () => null;
    },
});
</script>
